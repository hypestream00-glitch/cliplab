import "dotenv/config";
import { config } from "dotenv";
import { randomUUID } from "node:crypto";

config({ path: ".env.local", override: true });

function redact(err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  return message.replace(/rediss?:\/\/[^\s'"]+/gi, "rediss://[redacted]").replace(/[A-Za-z0-9+/]{24,}/g, "[redacted]");
}

function fail(label: string, err?: unknown) {
  console.log(`FAIL ${label}${err ? ` — ${redact(err)}` : ""}`);
  process.exitCode = 1;
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const url = process.env.REDIS_URL?.trim() ?? "";
  if (!url) {
    fail("CONFIG — REDIS_URL missing");
    return;
  }
  if (!url.startsWith("rediss://")) {
    fail("TLS — REDIS_URL is not rediss://");
    return;
  }
  console.log("OK TLS — rediss://");

  const { createRedisConnection, resetRedisCache, redisUsesTls } = await import("@/lib/queue/redis");
  const { queueMode } = await import("@/lib/queue/runtime");
  const { enqueue, getQueue } = await import("@/lib/queue");
  const { getStorage, resetStorageCache } = await import("@/lib/storage");

  resetRedisCache();
  if (!redisUsesTls()) {
    fail("TLS");
    return;
  }

  const redis = createRedisConnection();
  if (!redis) {
    fail("CONNECT");
    return;
  }

  try {
    const pong = await redis.ping();
    if (String(pong).toUpperCase() !== "PONG") throw new Error("unexpected ping");
    console.log("OK PING");
  } catch (error) {
    fail("PING", error);
    redis.disconnect();
    return;
  }

  const rwKey = `cliplab:infra-probe:rw:${randomUUID()}`;
  try {
    await redis.set(rwKey, "ok", "EX", 60);
    const got = await redis.get(rwKey);
    if (got !== "ok") throw new Error("read mismatch");
    await redis.del(rwKey);
    if (await redis.get(rwKey)) throw new Error("key lingered");
    console.log("OK READ/WRITE");
  } catch (error) {
    fail("READ/WRITE", error);
  }

  try {
    redis.disconnect();
    const again = createRedisConnection();
    if (!again) throw new Error("reconnect failed");
    await again.ping();
    again.disconnect();
    console.log("OK RECONNECT");
  } catch (error) {
    fail("RECONNECT", error);
  }

  resetRedisCache();
  if (queueMode() !== "redis") {
    fail("LOCAL FALLBACK — still active");
    return;
  }
  console.log("OK MODE — redis (local fallback disabled)");

  resetStorageCache();
  const storage = getStorage();
  const r2Key = `ws/_probe/${randomUUID()}.txt`;
  try {
    if (storage.name !== "r2") throw new Error(`provider ${storage.name}`);
    await storage.putObject(r2Key, Buffer.from("probe"), "text/plain");
    await storage.stat(r2Key);
    await storage.deleteObject(r2Key);
    if (await storage.exists(r2Key)) throw new Error("r2 probe lingered");
    console.log("OK R2");
  } catch (error) {
    fail("R2", error);
    try {
      await storage.deleteObject(r2Key);
    } catch {
      /* ignore */
    }
  }

  const probeId = randomUUID();
  const jobId = `probe-${probeId}`;
  const queue = getQueue("infra-probe");
  if (!queue) {
    fail("BULLMQ — queue not created");
    return;
  }

  const enqueued = await enqueue("infra-probe", {
    jobId,
    workspaceId: "system",
    entityId: probeId,
    type: "infra-probe",
  });
  if (enqueued.mocked || enqueued.mode !== "redis") {
    fail("ENQUEUE — job stayed in process memory");
    return;
  }
  console.log("OK ENQUEUE — BullMQ/Redis");

  const bullJobId = `infra-probe:${probeId}:${jobId}`;
  const seen = new Set<string>();
  let completed = false;
  const started = Date.now();
  while (Date.now() - started < 25_000) {
    const job = await queue.getJob(bullJobId);
    const state = job ? await job.getState() : "missing";
    seen.add(state);
    if (state === "completed") {
      completed = true;
      break;
    }
    if (state === "failed" && (job?.attemptsMade ?? 0) >= 3) break;
    await sleep(400);
  }

  console.log(`OK STATES — ${[...seen].join(" -> ")}`);
  if (!completed) {
    fail("TEST JOB — not completed");
  } else {
    console.log("OK TEST JOB — completed via independent worker");
  }
  if (!seen.has("waiting") && !seen.has("delayed") && !seen.has("active")) {
    fail("STATES — did not observe queue lifecycle");
  }
  if (!seen.has("failed") && !seen.has("delayed")) {
    fail("RETRY — first failure/backoff not observed");
  } else {
    console.log("OK RETRY/BACKOFF");
  }

  const resultRedis = createRedisConnection();
  try {
    const result = resultRedis ? await resultRedis.get(`cliplab:infra-probe:result:${probeId}`) : null;
    if (result !== "completed") fail("WORKER RESULT — missing");
    else console.log("OK WORKER RESULT");
  } finally {
    resultRedis?.disconnect();
  }

  try {
    const job = await queue.getJob(bullJobId);
    if (job) await job.remove();
    const cleanup = createRedisConnection();
    if (cleanup) {
      await cleanup.del(`cliplab:infra-probe:attempts:${probeId}`);
      await cleanup.del(`cliplab:infra-probe:result:${probeId}`);
      await cleanup.del(rwKey);
      cleanup.disconnect();
    }
    await queue.close();
    console.log("OK CLEANUP");
  } catch (error) {
    fail("CLEANUP", error);
  }
}

main().catch((error) => {
  fail("UNEXPECTED", error);
  process.exit(1);
});
