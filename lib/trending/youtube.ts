import { logger } from "@/lib/logger";
import {
  mapYouTubeCategory,
  parseIso8601Duration,
  type TrendingFetchDeps,
  type TrendingProviderError,
  type TrendingProviderItem,
  type TrendingProviderResult,
} from "@/lib/trending/providers";
import { YOUTUBE_API_BASE } from "@/lib/social/youtube/config";

export const YOUTUBE_TRENDING_SUPPORTED_REGIONS = ["BR", "US", "PT"] as const;
const SUPPORTED_REGIONS = new Set<string>(YOUTUBE_TRENDING_SUPPORTED_REGIONS);

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
  error?: {
    code?: number;
    message?: string;
    status?: string;
    errors?: Array<{ reason?: string; message?: string; domain?: string; location?: string }>;
  };
};

function finiteOrNull(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function parseYouTubeApiError(body: unknown, httpStatus: number): TrendingProviderError {
  const payload = (body ?? {}) as YouTubeListResponse;
  const google = payload.error;
  const nested = google?.errors?.find((item) => item.reason)?.reason ?? "";
  const status = google?.status?.trim() ?? "";
  const code = google?.code != null ? String(google.code) : httpStatus ? String(httpStatus) : null;
  const reason = nested || status || (httpStatus === 429 ? "quotaExceeded" : `youtube-http-${httpStatus}`);
  return {
    httpStatus,
    reason,
    code,
    message: youtubeErrorUserMessage(reason, httpStatus, google?.message),
  };
}

export function youtubeErrorUserMessage(reason: string, httpStatus: number, googleMessage?: string) {
  const r = reason.toLowerCase();
  const extra = `${googleMessage ?? ""}`.toLowerCase();
  const blob = `${r} ${extra}`;
  if (blob.includes("api_key_invalid") || blob.includes("keyinvalid") || blob.includes("apikeyinvalid") || blob.includes("api key not valid")) {
    return "A chave da YouTube Data API foi recusada. Confira YOUTUBE_API_KEY no servidor.";
  }
  if (blob.includes("quota") || blob.includes("ratelimit") || blob.includes("dailylimit") || blob.includes("userRateLimitExceeded".toLowerCase()) || httpStatus === 429) {
    return "A cota da YouTube Data API foi excedida. Tente novamente mais tarde.";
  }
  if (blob.includes("accessnotconfigured") || blob.includes("access not configured") || blob.includes("has not been used") || blob.includes("disabled")) {
    return "A YouTube Data API v3 não está habilitada no projeto Google Cloud desta chave.";
  }
  if (blob.includes("ipreferer") || blob.includes("refererblocked") || blob.includes("ipblocked") || blob.includes("requests from this referer") || blob.includes("requests from this ip")) {
    return "A chave da YouTube API está restrita por HTTP referer ou IP. Use uma chave de servidor sem restrição de referer do browser.";
  }
  if (blob.includes("invalidregion") || (blob.includes("region") && blob.includes("invalid"))) {
    return "Região inválida para o gráfico mostPopular da YouTube Data API.";
  }
  if (blob.includes("invalidcategory") || (blob.includes("category") && blob.includes("invalid"))) {
    return "Categoria inválida para o gráfico mostPopular da YouTube Data API.";
  }
  if (blob.includes("forbidden") || httpStatus === 403) {
    return "A YouTube Data API recusou o acesso. Confira restrições da chave e se a API está no mesmo projeto.";
  }
  return "Não foi possível carregar o YouTube em alta agora.";
}

function logYouTubeTrending(fields: {
  region: string;
  httpStatus: number | null;
  itemCount: number;
  googleReason?: string;
  googleCode?: string | null;
  available: boolean;
}) {
  logger.info(
    {
      provider: "YOUTUBE",
      region: fields.region,
      httpStatus: fields.httpStatus,
      itemCount: fields.itemCount,
      googleReason: fields.googleReason,
      googleCode: fields.googleCode,
      available: fields.available,
    },
    "youtube trending fetch",
  );
}

export function mapYouTubeVideoToTrendingItem(
  item: NonNullable<YouTubeListResponse["items"]>[number],
  region: string,
): TrendingProviderItem | null {
  const id = item.id?.trim();
  if (!id) return null;
  const viewsRaw = item.statistics?.viewCount != null ? Number(item.statistics.viewCount) : null;
  const likesRaw = item.statistics?.likeCount != null ? Number(item.statistics.likeCount) : null;
  const commentsRaw = item.statistics?.commentCount != null ? Number(item.statistics.commentCount) : null;
  const views = finiteOrNull(viewsRaw);
  const likes = finiteOrNull(likesRaw);
  const comments = finiteOrNull(commentsRaw);
  const engagement =
    views != null && views > 0 && likes != null && comments != null
      ? Math.min(100, Math.round(((likes + comments) / views) * 1000))
      : null;
  return {
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
    viewCount: views,
    likeCount: likes,
    engagement,
    publishedAt: item.snippet?.publishedAt ? new Date(item.snippet.publishedAt) : null,
    durationSeconds: parseIso8601Duration(item.contentDetails?.duration ?? ""),
    category: mapYouTubeCategory(item.snippet?.categoryId, item.snippet?.title ?? ""),
    kind: "content",
    region,
  };
}

export async function fetchYouTubeTrending(deps: TrendingFetchDeps = {}): Promise<TrendingProviderResult> {
  const key = deps.youtubeApiKey?.trim() ?? "";
  if (!key) {
    logYouTubeTrending({ region: (deps.region || "BR").toUpperCase(), httpStatus: null, itemCount: 0, googleReason: "missing-key", available: false });
    return {
      platform: "YOUTUBE",
      available: false,
      reason: "YOUTUBE_API_KEY ausente",
      error: {
        httpStatus: null,
        reason: "missing-key",
        code: null,
        message: "YOUTUBE_API_KEY não está definida neste processo.",
      },
      items: [],
    };
  }
  const region = (deps.region || "BR").toUpperCase();
  if (region === "GLOBAL" || !SUPPORTED_REGIONS.has(region)) {
    logYouTubeTrending({ region, httpStatus: null, itemCount: 0, googleReason: "unsupported-region", available: false });
    return {
      platform: "YOUTUBE",
      available: false,
      reason: "YouTube mostPopular exige regionCode. Global não é oferecido pela Data API v3.",
      error: {
        httpStatus: null,
        reason: "unsupported-region",
        code: null,
        message: "YouTube mostPopular exige regionCode. Global não é oferecido pela Data API v3.",
      },
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
  const response = await fetchImpl(url.toString(), {
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  });
  let body: YouTubeListResponse = {};
  try {
    body = (await response.json()) as YouTubeListResponse;
  } catch {
    body = {};
  }
  if (!response.ok) {
    const error = parseYouTubeApiError(body, response.status);
    logYouTubeTrending({
      region,
      httpStatus: response.status,
      itemCount: 0,
      googleReason: error.reason,
      googleCode: error.code,
      available: false,
    });
    return {
      platform: "YOUTUBE",
      available: false,
      reason: error.reason,
      error,
      items: [],
    };
  }
  const items: TrendingProviderItem[] = (body.items ?? [])
    .map((item) => mapYouTubeVideoToTrendingItem(item, region))
    .filter((item): item is TrendingProviderItem => Boolean(item));
  logYouTubeTrending({
    region,
    httpStatus: response.status,
    itemCount: items.length,
    googleReason: items.length ? undefined : "empty-result",
    googleCode: null,
    available: true,
  });
  return { platform: "YOUTUBE", available: true, items };
}
