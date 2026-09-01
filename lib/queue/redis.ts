import IORedis from "ioredis";
import { runtimeEnv } from "@/lib/env/runtime";

let shared: IORedis | null | undefined;

export function isRedisConfigured() {
  return Boolean(runtimeEnv("REDIS_URL"));
}

export function redisUsesTls() {
  return runtimeEnv("REDIS_URL").startsWith("rediss://");
}

export function bullmqConnection() {
  const url = runtimeEnv("REDIS_URL");
  if (!url) return null;
  return {
    url,
    maxRetriesPerRequest: null as null,
    enableReadyCheck: false,
    lazyConnect: true,
    connectTimeout: 10_000,
    keepAlive: 10_000,
    retryStrategy: (times: number) => Math.min(times * 200, 5000),
    ...(redisUsesTls() ? { tls: {} } : {}),
  };
}

export function createRedisConnection() {
  const url = runtimeEnv("REDIS_URL");
  if (!url) return null;
  const client = new IORedis(url, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    lazyConnect: true,
    connectTimeout: 10_000,
    keepAlive: 10_000,
    retryStrategy: (times) => Math.min(times * 200, 5000),
    ...(redisUsesTls() ? { tls: {} } : {}),
  });
  client.on("error", () => undefined);
  return client;
}

export function getSharedRedis() {
  if (shared !== undefined) return shared;
  shared = createRedisConnection();
  return shared;
}

export async function ensureSharedRedis() {
  const redis = getSharedRedis();
  if (!redis) return null;
  if (redis.status === "wait") await redis.connect();
  return redis;
}

export function resetRedisCache() {
  if (shared) {
    shared.disconnect();
  }
  shared = undefined;
}

export function workerConcurrency(queue?: string) {
  const raw = Number(process.env.WORKER_CONCURRENCY ?? "1");
  const n = Number.isFinite(raw) && raw > 0 ? Math.min(8, Math.floor(raw)) : 1;
  if (queue === "analytics-sync" || queue === "notifications") return Math.min(4, Math.max(1, n));
  return n;
}
