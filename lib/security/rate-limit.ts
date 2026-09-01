import { withTimeoutFallback } from "@/lib/async/timeout";
import { isRedisConfigured } from "@/lib/queue/redis";

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

export type RateLimitResult = { ok: true } | { ok: false; retryAfterSec: number };

export function rateLimit(params: { key: string; limit: number; windowMs: number }): RateLimitResult {
  const now = Date.now();
  const current = buckets.get(params.key);
  if (!current || current.resetAt <= now) {
    buckets.set(params.key, { count: 1, resetAt: now + params.windowMs });
    return { ok: true };
  }
  if (current.count >= params.limit) {
    return { ok: false, retryAfterSec: Math.max(1, Math.ceil((current.resetAt - now) / 1000)) };
  }
  current.count += 1;
  return { ok: true };
}

export async function rateLimitAsync(params: { key: string; limit: number; windowMs: number }): Promise<RateLimitResult> {
  if (isRedisConfigured()) {
    try {
      const { ensureSharedRedis } = await import("@/lib/queue/redis");
      const redis = await ensureSharedRedis();
      if (redis) {
        const redisKey = `cliplab:rl:${params.key}`;
        const count = await withTimeoutFallback(redis.incr(redisKey), 2_500, -1, "rate-limit incr");
        if (count < 0) return rateLimit(params);
        if (count === 1) await withTimeoutFallback(redis.pexpire(redisKey, params.windowMs), 2_000, 0, "rate-limit expire");
        if (count > params.limit) {
          const ttl = await withTimeoutFallback(redis.pttl(redisKey), 2_000, params.windowMs, "rate-limit ttl");
          return { ok: false, retryAfterSec: Math.max(1, Math.ceil((ttl > 0 ? ttl : params.windowMs) / 1000)) };
        }
        return { ok: true };
      }
    } catch {
      /* Redis unavailable — fall back to process memory for this request */
    }
  }
  return rateLimit(params);
}

export function resetRateLimitForTests() {
  buckets.clear();
}
