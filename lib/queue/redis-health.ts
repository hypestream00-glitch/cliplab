import { ensureSharedRedis, isRedisConfigured } from "@/lib/queue/redis";
import { recordRedisUsage } from "@/lib/queue/redis-usage";
import { isProductionRuntime } from "@/lib/queue/runtime";

const CACHE_MS = 30_000;

let cached:
  | { at: number; value: "ok" | "error" | "unset" }
  | null = null;

export function resetRedisHealthCache() {
  cached = null;
}

export async function cachedRedisPing(force = false): Promise<"ok" | "error" | "unset"> {
  if (!isRedisConfigured()) return isProductionRuntime() ? "error" : "unset";
  if (!force && cached && Date.now() - cached.at < CACHE_MS) return cached.value;
  try {
    recordRedisUsage("health");
    const redis = await ensureSharedRedis();
    const pong = await redis?.ping();
    const value = pong === "PONG" ? "ok" : "error";
    cached = { at: Date.now(), value };
    return value;
  } catch {
    cached = { at: Date.now(), value: "error" };
    return "error";
  }
}
