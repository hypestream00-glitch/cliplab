import { prisma } from "@/lib/db/prisma";
import { computeTrendScore } from "@/lib/trending/score";
import { fetchYouTubeTrending } from "@/lib/trending/youtube";
import { fetchTwitchPopular, unsupportedTrending } from "@/lib/trending/twitch";
import { fetchKickPopular } from "@/lib/trending/kick";
import {
  readTrendingCache,
  writeTrendingCache,
  youtubeTrendingCacheKey,
  twitchTrendingCacheKey,
  kickTrendingCacheKey,
} from "@/lib/trending/cache";
import {
  trendingFetchDepsFromEnv,
  type TrendingFetchDeps,
  type TrendingProviderItem,
  type TrendingProviderResult,
} from "@/lib/trending/providers";
import { logger } from "@/lib/logger";

function reviveProviderResult(result: TrendingProviderResult): TrendingProviderResult {
  return {
    ...result,
    items: result.items.map((item) => ({
      ...item,
      publishedAt: item.publishedAt ? new Date(item.publishedAt) : null,
    })),
  };
}

export async function collectTrendingProviders(deps: TrendingFetchDeps = trendingFetchDepsFromEnv()) {
  const region = deps.region || "BR";
  const category = deps.youtubeCategoryId?.trim() || "all";
  const youtubeKey = youtubeTrendingCacheKey(region, category);
  const twitchKey = twitchTrendingCacheKey();
  const kickKey = kickTrendingCacheKey();
  const cachedYoutube = await readTrendingCache<TrendingProviderResult>(youtubeKey);
  const cachedTwitch = await readTrendingCache<TrendingProviderResult>(twitchKey);
  const cachedKick = await readTrendingCache<TrendingProviderResult>(kickKey);
  const youtube = cachedYoutube ? reviveProviderResult(cachedYoutube) : await fetchYouTubeTrending(deps);
  if (!cachedYoutube && youtube.available) await writeTrendingCache(youtubeKey, youtube);
  const twitch = cachedTwitch ? reviveProviderResult(cachedTwitch) : await fetchTwitchPopular(deps);
  if (!cachedTwitch && twitch.available) await writeTrendingCache(twitchKey, twitch);
  const kick = cachedKick ? reviveProviderResult(cachedKick) : await fetchKickPopular(deps);
  if (!cachedKick && kick.available) await writeTrendingCache(kickKey, kick);
  return [youtube, twitch, kick, unsupportedTrending("BILIBILI"), unsupportedTrending("TIKTOK"), unsupportedTrending("INSTAGRAM")];
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
    if (existing?.viewCount != null && item.viewCount != null && now.getTime() - existing.updatedAt.getTime() < 36 * 3_600_000) {
      views24h = Math.max(0, item.viewCount - existing.viewCount);
    }
    const data = {
      platform: item.platform,
      category: item.category,
      title: item.title,
      creatorName: item.creatorName ?? null,
      thumbnailUrl: item.thumbnailUrl ?? null,
      canonicalUrl: item.canonicalUrl,
      externalId: item.externalId,
      durationSeconds: item.durationSeconds ?? null,
      viewCount: item.viewCount ?? null,
      views24h,
      engagement: item.engagement ?? null,
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

export async function refreshTrendingCatalog(deps: TrendingFetchDeps = trendingFetchDepsFromEnv()) {
  try {
    const results = await collectTrendingProviders(deps);
    for (const result of results) {
      if (result.items.length) await persistTrendingItems(result.items, `${result.platform.toLowerCase()}-api`);
    }
    return results;
  } catch (error) {
    logger.warn({ errType: error instanceof Error ? error.name : "Error" }, "trending refresh skipped");
    return [];
  }
}
