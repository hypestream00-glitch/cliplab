import IORedis from "ioredis";

let shared: IORedis | null | undefined;

export function isRedisConfigured() {
  return Boolean(process.env.REDIS_URL?.trim());
}

export function redisUsesTls() {
  return (process.env.REDIS_URL ?? "").trim().startsWith("rediss://");
}

export function bullmqConnection() {
  const url = process.env.REDIS_URL?.trim();
  if (!url) return null;
  return {
    url,
    maxRetriesPerRequest: null as null,
    enableReadyCheck: false,
    connectTimeout: 10_000,
    keepAlive: 10_000,
    retryStrategy: (times: number) => Math.min(times * 200, 5000),
    ...(redisUsesTls() ? { tls: {} } : {}),
  };
}

export function createRedisConnection() {
  const url = process.env.REDIS_URL?.trim();
  if (!url) return null;
  const client = new IORedis(url, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
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
