import { classifyIngestUrl, providerLabel, type ClassifiedIngestUrl } from "@/lib/ingest/classify";
import { IngestError, ingestErrorMessage } from "@/lib/ingest/errors";
import { safeIngestFetch } from "@/lib/ingest/safe-fetch";
import type { HostLookup } from "@/lib/security/ssrf";

export type IngestPreview = {
  provider: ClassifiedIngestUrl["provider"];
  sourceKind: ClassifiedIngestUrl["sourceKind"];
  url: string;
  title: string | null;
  creatorName: string | null;
  thumbnailUrl: string | null;
  durationSeconds: number | null;
  platformLabel: string;
  ingestSupported: boolean;
  metadataSupported: boolean;
  message?: string;
};

export type PreviewDeps = {
  lookup?: HostLookup;
  fetchImpl?: typeof fetch;
  youtubeApiKey?: string;
  twitchClientId?: string;
  twitchClientSecret?: string;
};

function classifiedOrThrow(raw: string) {
  const classified = classifyIngestUrl(raw);
  if (!classified) throw new IngestError(ingestErrorMessage("invalid-url"), "invalid-url");
  return classified;
}

export async function previewIngestUrl(raw: string, deps: PreviewDeps = {}): Promise<IngestPreview> {
  const classified = classifiedOrThrow(raw);
  const base: IngestPreview = {
    provider: classified.provider,
    sourceKind: classified.sourceKind,
    url: classified.url,
    title: null,
    creatorName: null,
    thumbnailUrl: null,
    durationSeconds: null,
    platformLabel: providerLabel(classified.provider),
    ingestSupported: classified.ingestSupported,
    metadataSupported: classified.metadataSupported,
    message: classified.ingestSupported ? undefined : classified.reason ?? ingestErrorMessage("unsupported"),
  };

  if (classified.provider === "YOUTUBE") {
    return { ...base, ...(await previewYouTube(classified, deps)) };
  }
  if (classified.provider === "TWITCH") {
    return { ...base, ...(await previewTwitch(classified, deps)) };
  }
  if (classified.provider === "DIRECT_URL") {
    return { ...base, ...(await previewDirect(classified.url, deps)) };
  }
  return { ...base, message: ingestErrorMessage("unsupported"), ingestSupported: false };
}

function isVideoContentType(type: string, url: string) {
  const lower = type.toLowerCase();
  if (lower.startsWith("video/")) return true;
  if (lower === "application/octet-stream") return true;
  return /\.(mp4|mov|webm)(?:$|[?#])/i.test(url);
}

async function previewDirect(url: string, deps: PreviewDeps) {
  const request = (method: string, headers?: Record<string, string>) =>
    safeIngestFetch(url, {
      method,
      headers,
      timeoutMs: 12_000,
      lookup: deps.lookup,
      fetchImpl: deps.fetchImpl,
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
  const name = filenameFromUrl(finalUrl);
  if (type && !isVideoContentType(type, finalUrl)) {
    return {
      url: finalUrl,
      title: name,
      ingestSupported: false,
      message: ingestErrorMessage("unsupported"),
    };
  }
  return {
    url: finalUrl,
    title: name,
    ingestSupported: true,
    message: undefined as string | undefined,
  };
}

async function previewYouTube(classified: ClassifiedIngestUrl, deps: PreviewDeps) {
  const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(classified.url)}&format=json`;
  try {
    const { response } = await safeIngestFetch(oembedUrl, {
      timeoutMs: 12_000,
      lookup: deps.lookup,
      fetchImpl: deps.fetchImpl,
      headers: {
        Accept: "application/json",
        "User-Agent": "CortaClip/1.0 (+https://cortaclip.com)",
      },
    });
    if (response.status === 401) {
      throw new IngestError(ingestErrorMessage("private"), "private");
    }
    if (!response.ok) {
      return {
        title: classified.externalId ? `YouTube · ${classified.externalId}` : "YouTube",
        ingestSupported: false,
        message: ingestErrorMessage("unsupported"),
      };
    }
    const body = (await response.json()) as { title?: string; author_name?: string; thumbnail_url?: string };
    let durationSeconds: number | null = null;
    if (deps.youtubeApiKey && classified.externalId) {
      durationSeconds = await youtubeDuration(classified.externalId, deps);
    }
    return {
      title: body.title ?? null,
      creatorName: body.author_name ?? null,
      thumbnailUrl: body.thumbnail_url ?? null,
      durationSeconds,
      ingestSupported: false,
      message: ingestErrorMessage("unsupported"),
    };
  } catch (error) {
    if (error instanceof IngestError) throw error;
    throw new IngestError(ingestErrorMessage("unavailable"), "unavailable");
  }
}

async function youtubeDuration(videoId: string, deps: PreviewDeps) {
  if (!deps.youtubeApiKey) return null;
  const url = new URL("https://www.googleapis.com/youtube/v3/videos");
  url.searchParams.set("part", "contentDetails");
  url.searchParams.set("id", videoId);
  url.searchParams.set("key", deps.youtubeApiKey);
  const { response } = await safeIngestFetch(url.toString(), {
    timeoutMs: 12_000,
    lookup: deps.lookup,
    fetchImpl: deps.fetchImpl,
  });
  if (!response.ok) return null;
  const body = (await response.json()) as { items?: Array<{ contentDetails?: { duration?: string } }> };
  return parseIsoDuration(body.items?.[0]?.contentDetails?.duration ?? "");
}

async function previewTwitch(classified: ClassifiedIngestUrl, deps: PreviewDeps) {
  if (!deps.twitchClientId || !deps.twitchClientSecret || !classified.externalId) {
    return { ingestSupported: false, message: ingestErrorMessage("unsupported") };
  }
  return { ingestSupported: false, message: ingestErrorMessage("unsupported") };
}

export function parseIsoDuration(value: string) {
  const match = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/i.exec(value);
  if (!match) return null;
  const hours = Number(match[1] ?? 0);
  const minutes = Number(match[2] ?? 0);
  const seconds = Number(match[3] ?? 0);
  return hours * 3600 + minutes * 60 + seconds;
}

function filenameFromUrl(url: string) {
  try {
    const name = decodeURIComponent(new URL(url).pathname.split("/").filter(Boolean).at(-1) ?? "video.mp4");
    return name.slice(0, 80) || "video.mp4";
  } catch {
    return "video.mp4";
  }
}

export function ingestPreviewDepsFromEnv(source: NodeJS.ProcessEnv = process.env): PreviewDeps {
  return {
    youtubeApiKey: source.YOUTUBE_API_KEY?.trim() || source.GOOGLE_API_KEY?.trim() || "",
    twitchClientId: source.TWITCH_CLIENT_ID?.trim() || "",
    twitchClientSecret: source.TWITCH_CLIENT_SECRET?.trim() || "",
  };
}
