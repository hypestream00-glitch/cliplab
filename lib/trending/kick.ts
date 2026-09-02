import type { TrendingFetchDeps, TrendingProviderItem, TrendingProviderResult } from "@/lib/trending/providers";
import { KICK_LIVESTREAMS_URL } from "@/lib/social/kick/config";
import { kickAppToken } from "@/lib/social/kick/provider";

type KickLivestreams = {
  data?: Array<{
    id?: string;
    title?: string;
    thumbnail?: string;
    viewer_count?: number;
    started_at?: string;
    broadcaster_user?: { id?: number; username?: string; profile_picture?: string };
    category?: { name?: string };
    channel?: { slug?: string };
  }>;
  message?: string;
};

export async function fetchKickPopular(deps: TrendingFetchDeps = {}): Promise<TrendingProviderResult> {
  const clientId = deps.kickClientId?.trim() ?? "";
  const clientSecret = deps.kickClientSecret?.trim() ?? "";
  if (!clientId || !clientSecret) {
    return { platform: "KICK", available: false, reason: "KICK_CLIENT_ID/SECRET ausentes", items: [] };
  }
  const fetchImpl = deps.fetchImpl ?? fetch;
  const auth = await kickAppToken({ clientId, clientSecret, fetchImpl });
  if (!auth) {
    return { platform: "KICK", available: true, reason: "kick-token-missing", items: [] };
  }
  const url = new URL(KICK_LIVESTREAMS_URL);
  url.searchParams.set("limit", "32");
  const response = await fetchImpl(url.toString(), {
    headers: { Authorization: `Bearer ${auth.token}` },
    signal: AbortSignal.timeout(12_000),
  });
  if (response.status === 429) {
    return { platform: "KICK", available: true, reason: "rate-limited", items: [] };
  }
  if (!response.ok) {
    return { platform: "KICK", available: true, reason: `kick-http-${response.status}`, items: [] };
  }
  const body = (await response.json()) as KickLivestreams;
  const items: TrendingProviderItem[] = (body.data ?? [])
    .map((row) => {
      const slug = row.channel?.slug?.trim() || row.broadcaster_user?.username?.trim();
      const id = row.id?.trim() || slug;
      if (!id) return null;
      const viewers = typeof row.viewer_count === "number" && Number.isFinite(row.viewer_count) ? row.viewer_count : null;
      const mapped: TrendingProviderItem = {
        externalId: id,
        platform: "KICK",
        title: row.title?.trim() || "Transmissão Kick",
        creatorName: row.broadcaster_user?.username ?? slug ?? null,
        thumbnailUrl: row.thumbnail ?? null,
        canonicalUrl: slug ? `https://kick.com/${slug}` : "https://kick.com",
        viewCount: viewers,
        publishedAt: row.started_at ? new Date(row.started_at) : null,
        category: /game/i.test(row.category?.name ?? "") ? "Games" : "Entretenimento",
        kind: "live",
      };
      return mapped;
    })
    .filter((item): item is TrendingProviderItem => Boolean(item));
  items.sort((a, b) => (b.viewCount ?? -1) - (a.viewCount ?? -1));
  return { platform: "KICK", available: true, items };
}
