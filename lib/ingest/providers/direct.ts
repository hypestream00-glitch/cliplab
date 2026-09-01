import { IngestError, ingestErrorMessage } from "@/lib/ingest/errors";
import { isVideoContentType } from "@/lib/ingest/media-type";
import { safeIngestFetch } from "@/lib/ingest/safe-fetch";
import type { IngestPreview, MediaImportContext, MediaImportProvider } from "@/lib/ingest/types";
import { filenameFromIngestUrl, looksLikeDirectVideoFile } from "@/lib/ingest/url";

export const directUrlProvider: MediaImportProvider = {
  id: "DIRECT_URL",
  capabilities: {
    metadata: true,
    import: true,
    requiresAuth: false,
    directMedia: true,
  },
  detect(url) {
    const href = url.toString();
    const looksLikeDirectFile = looksLikeDirectVideoFile(url);
    return {
      provider: "DIRECT_URL",
      sourceKind: "DIRECT_URL",
      url: href,
      ingestSupported: true,
      metadataSupported: true,
      reason: looksLikeDirectFile ? undefined : "Confirme o tipo do arquivo ao analisar o link.",
    };
  },
  canImport(classified) {
    return classified.provider === "DIRECT_URL" && classified.ingestSupported;
  },
  async getMetadata(classified, ctx) {
    return previewDirect(classified.url, ctx);
  },
  async importMedia(classified, ctx) {
    const { downloadDirectVideoToStorage } = await import("@/lib/ingest/download");
    if (!ctx.workspaceId || !ctx.maxBytes) {
      throw new IngestError(ingestErrorMessage("unavailable"), "unavailable");
    }
    return downloadDirectVideoToStorage({
      workspaceId: ctx.workspaceId,
      url: classified.url,
      maxBytes: ctx.maxBytes,
      deps: {
        lookup: ctx.lookup,
        fetchImpl: ctx.fetchImpl,
        signal: ctx.signal,
      },
    });
  },
};

async function previewDirect(url: string, ctx: MediaImportContext): Promise<Partial<IngestPreview>> {
  const request = (method: string, headers?: Record<string, string>) =>
    safeIngestFetch(url, {
      method,
      headers,
      timeoutMs: 12_000,
      lookup: ctx.lookup,
      fetchImpl: ctx.fetchImpl,
      signal: ctx.signal,
    });

  let response: Response;
  let finalUrl = url;
  try {
    const head = await request("HEAD");
    response = head.response;
    finalUrl = head.finalUrl;
    if (response.status === 405 || response.status === 501 || !response.ok) {
      const ranged = await request("GET", { Range: "bytes=0-1023" });
      response = ranged.response;
      finalUrl = ranged.finalUrl;
    }
  } catch (error) {
    if (error instanceof IngestError && error.code === "blocked") throw error;
    try {
      const ranged = await request("GET", { Range: "bytes=0-1023" });
      response = ranged.response;
      finalUrl = ranged.finalUrl;
    } catch (fallback) {
      if (fallback instanceof IngestError) throw fallback;
      throw new IngestError(ingestErrorMessage("unavailable"), "unavailable");
    }
  }
  if (response.status === 401 || response.status === 403 || response.status === 404) {
    throw new IngestError(ingestErrorMessage("private"), "private");
  }
  const type = (response.headers.get("content-type") ?? "").toLowerCase();
  const name = filenameFromIngestUrl(finalUrl);
  if (type && !isVideoContentType(type, finalUrl)) {
    return {
      url: finalUrl,
      title: name,
      ingestSupported: false,
      metadataSupported: true,
      availability: "not-media",
      message: "Este link não aponta para um arquivo de vídeo compatível (MP4, MOV ou WEBM).",
    };
  }
  return {
    url: finalUrl,
    title: name,
    ingestSupported: true,
    availability: "import-ready",
    message: undefined,
  };
}
