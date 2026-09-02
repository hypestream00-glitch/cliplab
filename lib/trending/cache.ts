import { ensureSharedRedis } from "@/lib/queue/redis";
import { YOUTUBE_TRENDING_REGIONS } from "@/lib/competitions/platforms";
import type { TrendingProviderResult } from "@/lib/trending/providers";

const DEFAULT_TTL_SEC = 30 * 60;
export const YOUTUBE_ERROR_CACHE_TTL_SEC = 60;

export async function readTrendingCache<T>(key: string): Promise<T | null> {
  const redis = await ensureSharedRedis();
  if (!redis) return null;
  const raw = await redis.get(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function writeTrendingCache(key: string, value: unknown, ttlSec = DEFAULT_TTL_SEC) {
  const redis = await ensureSharedRedis();
  if (!redis) return false;
  await redis.set(key, JSON.stringify(value), "EX", ttlSec);
  return true;
}

export async function deleteTrendingCache(key: string) {
  const redis = await ensureSharedRedis();
  if (!redis) return false;
  await redis.del(key);
  return true;
}

export function youtubeTrendingCacheKey(region = "BR", category = "all") {
  return `trending:youtube:${region.toUpperCase()}:${category || "all"}:popular`;
}

export function youtubeTrendingLegacyCacheKey(region = "BR") {
  return `trending:youtube:${region.toUpperCase()}`;
}

export function youtubeTrendingCacheKeysForRegion(region = "BR", category = "all") {
  const current = youtubeTrendingCacheKey(region, category);
  return [current, youtubeTrendingLegacyCacheKey(region)];
}

export async function invalidateYouTubeTrendingCache(region?: string, category = "all") {
  const regions = region ? [region.toUpperCase()] : YOUTUBE_TRENDING_REGIONS.map((item) => item.id);
  const keys = regions.flatMap((item) => youtubeTrendingCacheKeysForRegion(item, category));
  let deleted = 0;
  for (const key of keys) {
    if (await deleteTrendingCache(key)) deleted += 1;
  }
  return deleted;
}

export function shouldCacheYouTubeResult(result: TrendingProviderResult) {
  return result.available && !result.error && result.items.length > 0;
}

export function isUsableYouTubeCache(cached: TrendingProviderResult | null | undefined) {
  if (!cached) return false;
  if (cached.error) return false;
  if (!cached.available) return false;
  return cached.items.length > 0;
}

export function isYouTubeErrorCache(cached: TrendingProviderResult | null | undefined) {
  return Boolean(cached?.error);
}

export function isStaleEmptyYouTubeCache(cached: TrendingProviderResult | null | undefined) {
  if (!cached || cached.error) return false;
  return !cached.available || cached.items.length === 0;
}

export function twitchTrendingCacheKey() {
  return "trending:twitch:popular";
}

export function kickTrendingCacheKey() {
  return "trending:kick:livestreams";
}
