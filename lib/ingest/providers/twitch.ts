import { ingestErrorMessage } from "@/lib/ingest/errors";
import { safeIngestFetch } from "@/lib/ingest/safe-fetch";
import type { ClassifiedIngestUrl, IngestPreview, MediaImportContext, MediaImportProvider } from "@/lib/ingest/types";
import { hostOf } from "@/lib/ingest/url";

export const twitchProvider: MediaImportProvider = {
  id: "TWITCH",
  capabilities: {
    metadata: true,
    import: false,
    requiresAuth: false,
    directMedia: false,
  },
  detect(url) {
    const host = hostOf(url);
    if (host !== "twitch.tv" && !host.endsWith(".twitch.tv")) return null;
    const videoId = url.pathname.match(/\/videos\/(\d+)/)?.[1];
    return {
      provider: "TWITCH",
      sourceKind: "TWITCH",
      url: url.toString(),
      externalId: videoId,
      ingestSupported: false,
      metadataSupported: true,
      reason: ingestErrorMessage("import-unavailable"),
    };
  },
  canImport() {
    return false;
  },
  async getMetadata(classified, ctx) {
    return previewTwitch(classified, ctx);
  },
};

async function previewTwitch(classified: ClassifiedIngestUrl, ctx: MediaImportContext): Promise<Partial<IngestPreview>> {
  const fallback: Partial<IngestPreview> = {
    title: classified.externalId ? `Twitch · ${classified.externalId}` : "Twitch",
    ingestSupported: false,
    availability: classified.externalId ? "platform-no-import" : "platform-no-import",
    message: ingestErrorMessage("import-unavailable"),
  };
  if (!ctx.twitchClientId || !ctx.twitchClientSecret || !classified.externalId) {
    return fallback;
  }
  try {
    const tokenRes = await (ctx.fetchImpl ?? fetch)("https://id.twitch.tv/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: ctx.twitchClientId,
        client_secret: ctx.twitchClientSecret,
        grant_type: "client_credentials",
      }).toString(),
      signal: AbortSignal.timeout(12_000),
    });
    if (!tokenRes.ok) return fallback;
    const token = (await tokenRes.json()) as { access_token?: string };
    if (!token.access_token) return fallback;
    const { response } = await safeIngestFetch(`https://api.twitch.tv/helix/videos?id=${encodeURIComponent(classified.externalId)}`, {
      timeoutMs: 12_000,
      lookup: ctx.lookup,
      fetchImpl: ctx.fetchImpl,
      headers: {
        "Client-Id": ctx.twitchClientId,
        Authorization: `Bearer ${token.access_token}`,
      },
    });
    if (!response.ok) return fallback;
    const body = (await response.json()) as {
      data?: Array<{ title?: string; user_name?: string; thumbnail_url?: string; duration?: string }>;
    };
    const video = body.data?.[0];
    if (!video) return fallback;
    return {
      title: video.title ?? fallback.title,
      creatorName: video.user_name ?? null,
      thumbnailUrl: video.thumbnail_url
        ? video.thumbnail_url.replace("%{width}", "640").replace("%{height}", "360").replace("{width}", "640").replace("{height}", "360")
        : null,
      durationSeconds: parseTwitchDuration(video.duration ?? ""),
      ingestSupported: false,
      availability: "found-no-import",
      message: ingestErrorMessage("import-unavailable"),
    };
  } catch {
    return fallback;
  }
}

function parseTwitchDuration(value: string) {
  const match = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/i.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1] ?? 0);
  const minutes = Number(match[2] ?? 0);
  const seconds = Number(match[3] ?? 0);
  const total = hours * 3600 + minutes * 60 + seconds;
  return total > 0 ? total : null;
}
