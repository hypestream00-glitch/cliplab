import { prisma } from "@/lib/db/prisma";
import { computeTrendScore } from "@/lib/trending/score";
import { fetchYouTubeTrending, YOUTUBE_TRENDING_SUPPORTED_REGIONS } from "@/lib/trending/youtube";
import { fetchTwitchPopular, unsupportedTrending } from "@/lib/trending/twitch";
import { fetchKickPopular } from "@/lib/trending/kick";
import {
  isStaleEmptyYouTubeCache,
  isUsableYouTubeCache,
  isYouTubeErrorCache,
  readTrendingCache,
  shouldCacheYouTubeResult,
  writeTrendingCache,
  youtubeTrendingCacheKey,
  twitchTrendingCacheKey,
  kickTrendingCacheKey,
  YOUTUBE_ERROR_CACHE_TTL_SEC,
  invalidateYouTubeTrendingCache,
} from "@/lib/trending/cache";
import {
  trendingFetchDepsFromEnv,
  type TrendingFetchDeps,
  type TrendingProviderItem,
  type TrendingProviderResult,
} from "@/lib/trending/providers";
import { logger } from "@/lib/logger";

const YOUTUBE_FRESH_MS = 30 * 60_000;

function reviveProviderResult(result: TrendingProviderResult): TrendingProviderResult {
  return {
    ...result,
    items: result.items.map((item) => ({
      ...item,
      publishedAt: item.publishedAt ? new Date(item.publishedAt) : null,
    })),
  };
}

export async function collectYouTubeTrending(deps: TrendingFetchDeps = trendingFetchDepsFromEnv()) {
  const region = (deps.region || "BR").toUpperCase();
  const category = deps.youtubeCategoryId?.trim() || "all";
  const youtubeKey = youtubeTrendingCacheKey(region, category);
  const cachedYoutube = await readTrendingCache<TrendingProviderResult>(youtubeKey);
  if (isUsableYouTubeCache(cachedYoutube) || isYouTubeErrorCache(cachedYoutube)) {
    return reviveProviderResult(cachedYoutube!);
  }
  if (isStaleEmptyYouTubeCache(cachedYoutube)) {
    await invalidateYouTubeTrendingCache(region, category);
  }
  const youtube = await fetchYouTubeTrending(deps);
  if (shouldCacheYouTubeResult(youtube)) {
    await writeTrendingCache(youtubeKey, youtube);
  } else if (youtube.error?.httpStatus) {
    await writeTrendingCache(youtubeKey, youtube, YOUTUBE_ERROR_CACHE_TTL_SEC);
  }
  return youtube;
}

export async function collectTwitchAndKick(deps: TrendingFetchDeps = trendingFetchDepsFromEnv()) {
  const twitchKey = twitchTrendingCacheKey();
  const kickKey = kickTrendingCacheKey();
  const cachedTwitch = await readTrendingCache<TrendingProviderResult>(twitchKey);
  const cachedKick = await readTrendingCache<TrendingProviderResult>(kickKey);
  const twitch = cachedTwitch ? reviveProviderResult(cachedTwitch) : await fetchTwitchPopular(deps);
  if (!cachedTwitch && twitch.available) await writeTrendingCache(twitchKey, twitch);
  const kick = cachedKick ? reviveProviderResult(cachedKick) : await fetchKickPopular(deps);
  if (!cachedKick && kick.available) await writeTrendingCache(kickKey, kick);
  return { twitch, kick };
}

export async function collectTrendingProviders(deps: TrendingFetchDeps = trendingFetchDepsFromEnv()) {
  const youtube = await collectYouTubeTrending(deps);
  const { twitch, kick } = await collectTwitchAndKick(deps);
  return [youtube, twitch, kick, unsupportedTrending("BILIBILI"), unsupportedTrending("TIKTOK"), unsupportedTrending("INSTAGRAM")];
}

function intOrNull(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return null;
  return Math.min(Math.max(Math.trunc(value), -2_147_483_648), 2_147_483_647);
}

export async function persistTrendingItems(items: TrendingProviderItem[], source: string) {
  const now = new Date();
  for (const item of items) {
    const existing = await prisma.trendingItem.findFirst({
      where: {
        platform: item.platform,
        externalId: item.externalId,
        ...(item.region ? { region: item.region } : {}),
      },
    });
    let views24h: number | null = null;
    const nextViews = intOrNull(item.viewCount);
    if (existing?.viewCount != null && nextViews != null && now.getTime() - existing.updatedAt.getTime() < 36 * 3_600_000) {
      views24h = Math.max(0, nextViews - existing.viewCount);
    }
    const data = {
      platform: item.platform,
      category: item.category,
      title: item.title,
      creatorName: item.creatorName ?? null,
      thumbnailUrl: item.thumbnailUrl ?? null,
      canonicalUrl: item.canonicalUrl,
      externalId: item.externalId,
      durationSeconds: intOrNull(item.durationSeconds),
      viewCount: nextViews,
      views24h,
      engagement: intOrNull(item.engagement),
      publishedAt: item.publishedAt ?? null,
      source,
      region: item.region ?? null,
      kind: item.kind ?? (item.platform === "TWITCH" || item.platform === "KICK" ? "live" : "content"),
      active: true,
    };
    const saved = existing
      ? await prisma.trendingItem.update({ where: { id: existing.id }, data })
      : await prisma.trendingItem.create({ data });
    const score = computeTrendScore({
      viewCount: saved.viewCount,
      views24h: saved.views24h,
      engagement: saved.engagement,
      publishedAt: saved.publishedAt,
      kind: saved.kind,
    });
    await prisma.trendingScore.create({
      data: {
        itemId: saved.id,
        score: score.score,
        computedAt: now,
        inputs: score.inputs,
      },
    });
  }
  if (items.length) {
    const platform = items[0].platform;
    const ids = items.map((item) => item.externalId);
    const region = items[0].region;
    await prisma.trendingItem.updateMany({
      where: {
        platform,
        source,
        active: true,
        externalId: { notIn: ids },
        ...(region ? { region } : {}),
      },
      data: { active: false },
    });
  }
}

async function youtubeCatalogIsFresh(region: string) {
  const count = await prisma.trendingItem.count({
    where: {
      platform: "YOUTUBE",
      active: true,
      region,
      updatedAt: { gte: new Date(Date.now() - YOUTUBE_FRESH_MS) },
    },
  });
  return count > 0;
}

export async function ensureYouTubeTrendingCatalog(deps: TrendingFetchDeps = trendingFetchDepsFromEnv()) {
  const region = (deps.region || "BR").toUpperCase();
  try {
    if (await youtubeCatalogIsFresh(region)) {
      return { platform: "YOUTUBE" as const, available: true, items: [] as TrendingProviderItem[] };
    }
    const youtube = await collectYouTubeTrending({ ...deps, region });
    if (youtube.items.length) await persistTrendingItems(youtube.items, "youtube-api");
    return youtube;
  } catch (error) {
    logger.warn({ errType: error instanceof Error ? error.name : "Error", provider: "YOUTUBE", region }, "youtube trending ensure skipped");
    return {
      platform: "YOUTUBE" as const,
      available: false,
      reason: "youtube-ensure-failed",
      error: {
        httpStatus: null,
        reason: "youtube-ensure-failed",
        code: null,
        message: "Não foi possível carregar o YouTube em alta agora.",
      },
      items: [] as TrendingProviderItem[],
    };
  }
}

export async function refreshTrendingCatalog(deps: TrendingFetchDeps = trendingFetchDepsFromEnv()) {
  try {
    const results: TrendingProviderResult[] = [];
    for (const region of YOUTUBE_TRENDING_SUPPORTED_REGIONS) {
      const youtube = await collectYouTubeTrending({ ...deps, region });
      if (youtube.items.length) await persistTrendingItems(youtube.items, "youtube-api");
      results.push(youtube);
    }
    const { twitch, kick } = await collectTwitchAndKick(deps);
    if (twitch.items.length) await persistTrendingItems(twitch.items, "twitch-api");
    if (kick.items.length) await persistTrendingItems(kick.items, "kick-api");
    results.push(twitch, kick, unsupportedTrending("BILIBILI"), unsupportedTrending("TIKTOK"), unsupportedTrending("INSTAGRAM"));
    return results;
  } catch (error) {
    logger.warn({ errType: error instanceof Error ? error.name : "Error" }, "trending refresh skipped");
    return [];
  }
}
