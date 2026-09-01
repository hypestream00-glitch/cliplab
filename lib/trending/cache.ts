import { ensureSharedRedis } from "@/lib/queue/redis";

const DEFAULT_TTL_SEC = 30 * 60;

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

export function youtubeTrendingCacheKey(region = "BR") {
  return `trending:youtube:${region.toUpperCase()}`;
}

export function twitchTrendingCacheKey() {
  return "trending:twitch:popular";
}
