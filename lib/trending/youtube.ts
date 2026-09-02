import {
  mapYouTubeCategory,
  parseIso8601Duration,
  type TrendingFetchDeps,
  type TrendingProviderItem,
  type TrendingProviderResult,
} from "@/lib/trending/providers";
import { YOUTUBE_API_BASE } from "@/lib/social/youtube/config";

const SUPPORTED_REGIONS = new Set(["BR", "US", "PT"]);

type YouTubeListResponse = {
  items?: Array<{
    id?: string;
    snippet?: {
      title?: string;
      channelId?: string;
      channelTitle?: string;
      publishedAt?: string;
      categoryId?: string;
      thumbnails?: { high?: { url?: string }; medium?: { url?: string }; default?: { url?: string } };
    };
    statistics?: { viewCount?: string; likeCount?: string; commentCount?: string };
    contentDetails?: { duration?: string };
  }>;
};

export async function fetchYouTubeTrending(deps: TrendingFetchDeps = {}): Promise<TrendingProviderResult> {
  const key = deps.youtubeApiKey?.trim() ?? "";
  if (!key) {
    return { platform: "YOUTUBE", available: false, reason: "YOUTUBE_API_KEY ausente", items: [] };
  }
  const region = (deps.region || "BR").toUpperCase();
  if (region === "GLOBAL" || !SUPPORTED_REGIONS.has(region)) {
    return {
      platform: "YOUTUBE",
      available: false,
      reason: "YouTube mostPopular exige regionCode. Global não é oferecido pela Data API v3.",
      items: [],
    };
  }
  const url = new URL(`${YOUTUBE_API_BASE}/videos`);
  url.searchParams.set("part", "snippet,statistics,contentDetails");
  url.searchParams.set("chart", "mostPopular");
  url.searchParams.set("regionCode", region);
  url.searchParams.set("maxResults", "32");
  url.searchParams.set("hl", "pt");
  url.searchParams.set("key", key);
  if (deps.youtubeCategoryId?.trim()) url.searchParams.set("videoCategoryId", deps.youtubeCategoryId.trim());
  const fetchImpl = deps.fetchImpl ?? fetch;
  const response = await fetchImpl(url.toString(), { signal: AbortSignal.timeout(15_000) });
  if (response.status === 429) {
    return { platform: "YOUTUBE", available: true, reason: "rate-limited", items: [] };
  }
  if (!response.ok) {
    return { platform: "YOUTUBE", available: true, reason: `youtube-http-${response.status}`, items: [] };
  }
  const body = (await response.json()) as YouTubeListResponse;
  const items: TrendingProviderItem[] = (body.items ?? [])
    .map((item) => {
      const id = item.id?.trim();
      if (!id) return null;
      const views = item.statistics?.viewCount != null ? Number(item.statistics.viewCount) : null;
      const likes = item.statistics?.likeCount != null ? Number(item.statistics.likeCount) : null;
      const comments = item.statistics?.commentCount != null ? Number(item.statistics.commentCount) : null;
      const engagement =
        views != null && views > 0 && likes != null && comments != null
          ? Math.min(100, Math.round(((likes + comments) / views) * 1000))
          : null;
      const mapped: TrendingProviderItem = {
        externalId: id,
        platform: "YOUTUBE",
        title: item.snippet?.title?.trim() || "Vídeo do YouTube",
        creatorName: item.snippet?.channelTitle ?? null,
        channelId: item.snippet?.channelId ?? null,
        thumbnailUrl:
          item.snippet?.thumbnails?.high?.url ??
          item.snippet?.thumbnails?.medium?.url ??
          item.snippet?.thumbnails?.default?.url ??
          null,
        canonicalUrl: `https://www.youtube.com/watch?v=${id}`,
        viewCount: Number.isFinite(views) ? views : null,
        engagement,
        publishedAt: item.snippet?.publishedAt ? new Date(item.snippet.publishedAt) : null,
        durationSeconds: parseIso8601Duration(item.contentDetails?.duration ?? ""),
        category: mapYouTubeCategory(item.snippet?.categoryId, item.snippet?.title ?? ""),
        kind: "content",
        region,
      };
      return mapped;
    })
    .filter((item): item is TrendingProviderItem => Boolean(item));
  return { platform: "YOUTUBE", available: true, items };
}
