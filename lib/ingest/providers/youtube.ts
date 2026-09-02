import { IngestError, ingestErrorMessage } from "@/lib/ingest/errors";
import { safeIngestFetch } from "@/lib/ingest/safe-fetch";
import type { ClassifiedIngestUrl, IngestPreview, MediaImportContext, MediaImportProvider } from "@/lib/ingest/types";
import { hostOf } from "@/lib/ingest/url";

export const youtubeProvider: MediaImportProvider = {
  id: "YOUTUBE",
  capabilities: {
    metadata: true,
    import: false,
    requiresAuth: false,
    directMedia: false,
  },
  detect(url) {
    const host = hostOf(url);
    const href = url.toString();
    if (host === "youtu.be") {
      const id = url.pathname.split("/").filter(Boolean)[0];
      return classifiedYouTube(id ? `https://www.youtube.com/watch?v=${id}` : href, id);
    }
    if (host === "youtube.com" || host.endsWith(".youtube.com")) {
      const id =
        url.searchParams.get("v") ||
        url.pathname.split("/shorts/")[1]?.split("/")[0] ||
        url.pathname.split("/embed/")[1]?.split("/")[0];
      return classifiedYouTube(id ? `https://www.youtube.com/watch?v=${id}` : href, id ?? undefined);
    }
    return null;
  },
  canImport() {
    return false;
  },
  async getMetadata(classified, ctx) {
    return previewYouTube(classified, ctx);
  },
};

function classifiedYouTube(url: string, externalId?: string): ClassifiedIngestUrl {
  return {
    provider: "YOUTUBE",
    sourceKind: "YOUTUBE",
    url,
    externalId,
    ingestSupported: false,
    metadataSupported: true,
    reason: ingestErrorMessage("import-unavailable"),
  };
}

async function previewYouTube(classified: ClassifiedIngestUrl, ctx: MediaImportContext): Promise<Partial<IngestPreview>> {
  const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(classified.url)}&format=json`;
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
    if (response.status === 401) {
      throw new IngestError(ingestErrorMessage("private"), "private");
    }
    if (response.status === 404) {
      throw new IngestError(ingestErrorMessage("not-found"), "not-found");
    }
    if (!response.ok) {
      return {
        title: classified.externalId ? `YouTube · ${classified.externalId}` : "YouTube",
        ingestSupported: false,
        availability: "platform-no-import",
        message: ingestErrorMessage("import-unavailable"),
      };
    }
    const body = (await response.json()) as { title?: string; author_name?: string; thumbnail_url?: string };
    let durationSeconds: number | null = null;
    if (ctx.youtubeApiKey && classified.externalId) {
      durationSeconds = await youtubeDuration(classified.externalId, ctx);
    }
    return {
      title: body.title ?? null,
      creatorName: body.author_name ?? null,
      thumbnailUrl: body.thumbnail_url ?? null,
      durationSeconds,
      ingestSupported: false,
      availability: "found-no-import",
      message: "Envie o arquivo original para criar clips.",
    };
  } catch (error) {
    if (error instanceof IngestError) throw error;
    throw new IngestError(ingestErrorMessage("unavailable"), "unavailable");
  }
}

async function youtubeDuration(videoId: string, ctx: MediaImportContext) {
  if (!ctx.youtubeApiKey) return null;
  const url = new URL("https://www.googleapis.com/youtube/v3/videos");
  url.searchParams.set("part", "contentDetails");
  url.searchParams.set("id", videoId);
  url.searchParams.set("key", ctx.youtubeApiKey);
  const { response } = await safeIngestFetch(url.toString(), {
    timeoutMs: 12_000,
    lookup: ctx.lookup,
    fetchImpl: ctx.fetchImpl,
  });
  if (!response.ok) return null;
  const body = (await response.json()) as { items?: Array<{ contentDetails?: { duration?: string } }> };
  return parseIsoDuration(body.items?.[0]?.contentDetails?.duration ?? "");
}

export function parseIsoDuration(value: string) {
  const match = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/i.exec(value);
  if (!match) return null;
  const hours = Number(match[1] ?? 0);
  const minutes = Number(match[2] ?? 0);
  const seconds = Number(match[3] ?? 0);
  return hours * 3600 + minutes * 60 + seconds;
}
