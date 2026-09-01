import { IngestError, ingestErrorMessage } from "@/lib/ingest/errors";
import { safeIngestFetch } from "@/lib/ingest/safe-fetch";
import type { ClassifiedIngestUrl, IngestPreview, MediaImportContext, MediaImportProvider } from "@/lib/ingest/types";
import { hostOf } from "@/lib/ingest/url";

export const tiktokProvider: MediaImportProvider = {
  id: "TIKTOK",
  capabilities: {
    metadata: true,
    import: false,
    requiresAuth: false,
    directMedia: false,
  },
  detect(url) {
    const host = hostOf(url);
    if (host !== "tiktok.com" && !host.endsWith(".tiktok.com")) return null;
    return {
      provider: "TIKTOK",
      sourceKind: "DIRECT_URL",
      url: url.toString(),
      ingestSupported: false,
      metadataSupported: true,
      reason: ingestErrorMessage("import-unavailable"),
    };
  },
  canImport() {
    return false;
  },
  async getMetadata(classified, ctx) {
    return previewTikTok(classified, ctx);
  },
};

async function previewTikTok(classified: ClassifiedIngestUrl, ctx: MediaImportContext): Promise<Partial<IngestPreview>> {
  const oembedUrl = `https://www.tiktok.com/oembed?url=${encodeURIComponent(classified.url)}`;
  try {
    const { response } = await safeIngestFetch(oembedUrl, {
      timeoutMs: 12_000,
      lookup: ctx.lookup,
      fetchImpl: ctx.fetchImpl,
      headers: {
        Accept: "application/json",
        "User-Agent": "CortaClip/1.0 (+https://cortaclip.com)",
      },
    });
    if (response.status === 401 || response.status === 403) {
      throw new IngestError(ingestErrorMessage("private"), "private");
    }
    if (!response.ok) {
      return {
        title: "TikTok",
        ingestSupported: false,
        availability: "platform-no-import",
        message: ingestErrorMessage("import-unavailable"),
      };
    }
    const body = (await response.json()) as { title?: string; author_name?: string; thumbnail_url?: string };
    return {
      title: body.title ?? "TikTok",
      creatorName: body.author_name ?? null,
      thumbnailUrl: body.thumbnail_url ?? null,
      ingestSupported: false,
      availability: body.title || body.thumbnail_url ? "found-no-import" : "platform-no-import",
      message: ingestErrorMessage("import-unavailable"),
    };
  } catch (error) {
    if (error instanceof IngestError) throw error;
    return {
      title: "TikTok",
      ingestSupported: false,
      availability: "platform-no-import",
      message: ingestErrorMessage("import-unavailable"),
    };
  }
}
