import { createWriteStream } from "node:fs";
import { open } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { classifyIngestUrl } from "@/lib/ingest/classify";
import { IngestError, ingestErrorMessage } from "@/lib/ingest/errors";
import { safeIngestFetch } from "@/lib/ingest/safe-fetch";
import { looksLikeVideoContainer, validateUploadFile } from "@/lib/media/validate";
import { randomStorageKey } from "@/lib/storage";
import { commitLocalFile, withJobTempDir } from "@/lib/storage/materialize";
import type { HostLookup } from "@/lib/security/ssrf";

export type DownloadDeps = {
  lookup?: HostLookup;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
};

const DOWNLOAD_TIMEOUT_MS = 120_000;

function filenameFromUrl(url: string) {
  try {
    const name = decodeURIComponent(new URL(url).pathname.split("/").filter(Boolean).at(-1) ?? "video.mp4");
    return /\.(mp4|mov|webm)$/i.test(name) ? name : `${name.replace(/\.[^.]+$/, "") || "video"}.mp4`;
  } catch {
    return "video.mp4";
  }
}

function mimeFromType(type: string, filename: string) {
  const lower = type.toLowerCase();
  if (lower.includes("webm")) return "video/webm";
  if (lower.includes("quicktime") || filename.toLowerCase().endsWith(".mov")) return "video/quicktime";
  return "video/mp4";
}

export async function downloadDirectVideoToStorage(params: {
  workspaceId: string;
  url: string;
  maxBytes: number;
  deps?: DownloadDeps;
}) {
  const classified = classifyIngestUrl(params.url);
  if (!classified) throw new IngestError(ingestErrorMessage("invalid-url"), "invalid-url");
  if (!classified.ingestSupported || classified.provider !== "DIRECT_URL") {
    throw new IngestError(ingestErrorMessage("unsupported"), "unsupported");
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
  const filename = filenameFromUrl(finalUrl);
  const mimeType = mimeFromType(response.headers.get("content-type") ?? "", filename);

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
      if (error instanceof IngestError) throw error;
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
    const validated = validateUploadFile({
      filename,
      mimeType,
      sizeBytes,
      maxBytes: params.maxBytes,
    });
    const storageKey = randomStorageKey(filename, `uploads/${params.workspaceId}`);
    await commitLocalFile(file, storageKey, validated.mime);
    return { storageKey, mimeType: validated.mime, sizeBytes, filename, finalUrl };
  });
}
