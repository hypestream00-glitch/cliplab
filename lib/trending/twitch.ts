import type { TrendingFetchDeps, TrendingProviderItem, TrendingProviderResult } from "@/lib/trending/providers";

type TwitchToken = { access_token?: string };
type TwitchStreams = {
  data?: Array<{
    id?: string;
    user_name?: string;
    title?: string;
    thumbnail_url?: string;
    viewer_count?: number;
    started_at?: string;
    game_name?: string;
  }>;
};

export async function fetchTwitchPopular(deps: TrendingFetchDeps = {}): Promise<TrendingProviderResult> {
  const clientId = deps.twitchClientId?.trim() ?? "";
  const clientSecret = deps.twitchClientSecret?.trim() ?? "";
  if (!clientId || !clientSecret) {
    return { platform: "TWITCH", available: false, reason: "TWITCH_CLIENT_ID/SECRET ausentes", items: [] };
  }
  const fetchImpl = deps.fetchImpl ?? fetch;
  const tokenRes = await fetchImpl("https://id.twitch.tv/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "client_credentials",
    }).toString(),
    signal: AbortSignal.timeout(12_000),
  });
  if (!tokenRes.ok) {
    return { platform: "TWITCH", available: true, reason: `twitch-token-${tokenRes.status}`, items: [] };
  }
  const token = (await tokenRes.json()) as TwitchToken;
  if (!token.access_token) {
    return { platform: "TWITCH", available: true, reason: "twitch-token-missing", items: [] };
  }
  const streamsRes = await fetchImpl("https://api.twitch.tv/helix/streams?first=20", {
    headers: { "Client-Id": clientId, Authorization: `Bearer ${token.access_token}` },
    signal: AbortSignal.timeout(12_000),
  });
  if (streamsRes.status === 429) {
    return { platform: "TWITCH", available: true, reason: "rate-limited", items: [] };
  }
  if (!streamsRes.ok) {
    return { platform: "TWITCH", available: true, reason: `twitch-http-${streamsRes.status}`, items: [] };
  }
  const body = (await streamsRes.json()) as TwitchStreams;
  const items: TrendingProviderItem[] = (body.data ?? [])
    .map((row) => {
      const id = row.id?.trim();
      if (!id) return null;
      const mapped: TrendingProviderItem = {
        externalId: id,
        platform: "TWITCH",
        title: row.title?.trim() || "Transmissão Twitch",
        creatorName: row.user_name ?? null,
        thumbnailUrl: row.thumbnail_url ? row.thumbnail_url.replace("{width}", "640").replace("{height}", "360") : null,
        canonicalUrl: row.user_name ? `https://www.twitch.tv/${row.user_name}` : `https://www.twitch.tv`,
        viewCount: typeof row.viewer_count === "number" ? row.viewer_count : null,
        publishedAt: row.started_at ? new Date(row.started_at) : null,
        category: /game/i.test(row.game_name ?? "") ? "Games" : "Entretenimento",
      };
      return mapped;
    })
    .filter((item): item is TrendingProviderItem => Boolean(item));
  return { platform: "TWITCH", available: true, items };
}

export function unsupportedTrending(platform: "KICK" | "TIKTOK" | "INSTAGRAM"): TrendingProviderResult {
  return {
    platform,
    available: false,
    reason: "Fonte ainda não disponível",
    items: [],
  };
}
