import { createWriteStream } from "node:fs";
import { open } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { classifyIngestUrl } from "@/lib/ingest/classify";
import { IngestError, ingestErrorMessage } from "@/lib/ingest/errors";
import { isVideoContentType, mimeFromVideoType } from "@/lib/ingest/media-type";
import { getMediaImportProvider } from "@/lib/ingest/providers";
import { safeIngestFetch } from "@/lib/ingest/safe-fetch";
import { looksLikeVideoContainer, InvalidVideoError, validateUploadFile } from "@/lib/media/validate";
import { getStorage, randomStorageKey } from "@/lib/storage";
import { commitLocalFile, withJobTempDir } from "@/lib/storage/materialize";
import type { HostLookup } from "@/lib/security/ssrf";
import { filenameFromIngestUrl } from "@/lib/ingest/url";

export type DownloadDeps = {
  lookup?: HostLookup;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
};

const DOWNLOAD_TIMEOUT_MS = 120_000;

function downloadFilename(url: string) {
  const name = filenameFromIngestUrl(url);
  return /\.(mp4|mov|webm)$/i.test(name) ? name : `${name.replace(/\.[^.]+$/, "") || "video"}.mp4`;
}

function unwrapIngestError(error: unknown): IngestError | null {
  if (error instanceof IngestError) return error;
  if (error instanceof Error && error.cause instanceof IngestError) return error.cause;
  if (error instanceof InvalidVideoError) return new IngestError(ingestErrorMessage("not-video"), "not-video");
  return null;
}

export async function downloadDirectVideoToStorage(params: {
  workspaceId: string;
  url: string;
  maxBytes: number;
  deps?: DownloadDeps;
}) {
  const classified = classifyIngestUrl(params.url);
  if (!classified) throw new IngestError(ingestErrorMessage("invalid-url"), "invalid-url");
  const provider = getMediaImportProvider(classified.provider);
  if (!provider.canImport(classified) || classified.provider !== "DIRECT_URL") {
    throw new IngestError(ingestErrorMessage("import-unavailable"), "import-unavailable");
  }

  try {
    const head = await safeIngestFetch(classified.url, {
      method: "HEAD",
      timeoutMs: 20_000,
      lookup: params.deps?.lookup,
      fetchImpl: params.deps?.fetchImpl,
      signal: params.deps?.signal,
    });
    if (head.response.ok) {
      const headLength = Number(head.response.headers.get("content-length") ?? 0);
      if (headLength > params.maxBytes) {
        throw new IngestError(ingestErrorMessage("too-large"), "too-large");
      }
      const headType = head.response.headers.get("content-type") ?? "";
      if (headType && !isVideoContentType(headType, head.finalUrl)) {
        throw new IngestError(ingestErrorMessage("not-video"), "not-video");
      }
    }
  } catch (error) {
    const ingest = unwrapIngestError(error);
    if (ingest && ingest.code !== "unavailable" && ingest.code !== "timeout") throw ingest;
  }

  const { response, finalUrl } = await safeIngestFetch(classified.url, {
    method: "GET",
    timeoutMs: DOWNLOAD_TIMEOUT_MS,
    lookup: params.deps?.lookup,
    fetchImpl: params.deps?.fetchImpl,
    signal: params.deps?.signal,
  });
  if (response.status === 401 || response.status === 403 || response.status === 404) {
    throw new IngestError(ingestErrorMessage("private"), "private");
  }
  if (!response.ok || !response.body) {
    throw new IngestError(ingestErrorMessage("unavailable"), "unavailable");
  }
  const contentLength = Number(response.headers.get("content-length") ?? 0);
  if (contentLength > params.maxBytes) {
    throw new IngestError(ingestErrorMessage("too-large"), "too-large");
  }
  const type = response.headers.get("content-type") ?? "";
  if (type && !isVideoContentType(type, finalUrl)) {
    throw new IngestError(ingestErrorMessage("not-video"), "not-video");
  }
  const filename = downloadFilename(finalUrl);
  const mimeType = mimeFromVideoType(type, filename);

  return withJobTempDir(async (dir) => {
    const file = path.join(dir, "ingest.bin");
    const nodeStream = Readable.fromWeb(response.body as import("node:stream/web").ReadableStream);
    let sizeBytes = 0;
    nodeStream.on("data", (chunk: Buffer) => {
      sizeBytes += chunk.length;
      if (sizeBytes > params.maxBytes) {
        nodeStream.destroy(new IngestError(ingestErrorMessage("too-large"), "too-large"));
      }
    });
    try {
      await pipeline(nodeStream, createWriteStream(file));
    } catch (error) {
      const ingest = unwrapIngestError(error);
      if (ingest) throw ingest;
      throw new IngestError(ingestErrorMessage("unavailable"), "unavailable");
    }
    if (sizeBytes <= 0) throw new IngestError(ingestErrorMessage("not-video"), "not-video");
    const handle = await open(file, "r");
    try {
      const header = Buffer.alloc(16);
      await handle.read(header, 0, 16, 0);
      if (!looksLikeVideoContainer(header)) {
        throw new IngestError(ingestErrorMessage("not-video"), "not-video");
      }
    } finally {
      await handle.close();
    }
    let validated;
    try {
      validated = validateUploadFile({
        filename,
        mimeType,
        sizeBytes,
        maxBytes: params.maxBytes,
      });
    } catch (error) {
      const ingest = unwrapIngestError(error);
      if (ingest) throw ingest;
      throw new IngestError(ingestErrorMessage("not-video"), "not-video");
    }
    const storageKey = randomStorageKey(filename, `uploads/${params.workspaceId}`);
    try {
      await commitLocalFile(file, storageKey, validated.mime);
    } catch {
      try {
        await getStorage().deleteObject(storageKey);
      } catch {
        /* ignore cleanup errors */
      }
      throw new IngestError(ingestErrorMessage("storage"), "storage");
    }
    return { storageKey, mimeType: validated.mime, sizeBytes, filename, finalUrl };
  });
}
