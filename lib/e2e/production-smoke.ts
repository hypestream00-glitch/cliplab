import { randomUUID } from "node:crypto";
import { isStripeLiveKeyBlocked, stripeSecretMode } from "@/lib/billing/stripe-mode";
import { externalAiProcessingAllowed, socialPublishAllowed } from "@/lib/env/status";
import { directObjectUploadEnabled } from "@/lib/uploads/policy";

export const SMOKE_CHECKS = [
  "DATABASE",
  "REDIS",
  "R2",
  "QUEUE",
  "WORKER",
  "PROCESSINGJOB",
  "UPLOADSESSION",
] as const;

export type SmokeCheckName = (typeof SMOKE_CHECKS)[number];

export type SmokeCheckResult = {
  name: SmokeCheckName;
  ok: boolean;
  skipped: boolean;
  detail: string;
};

export type ProductionSmokeResult = {
  ok: boolean;
  checks: SmokeCheckResult[];
  logs: string[];
};

export function requireLiveSmoke(source: NodeJS.ProcessEnv = process.env) {
  return source.NODE_ENV === "production" || source.CLIPLAB_PRODUCTION_SMOKE?.trim() === "1";
}

export function smokeOkLine(name: SmokeCheckName) {
  return `E2E SMOKE: ${name} OK`;
}

export function smokeFailLine(name: SmokeCheckName) {
  return `E2E SMOKE: ${name} FAIL`;
}

export const SMOKE_PASS_LINE = "E2E SMOKE: PASS";
export const SMOKE_FAIL_LINE = "E2E SMOKE: FAIL";

export function redactSmokeText(text: string) {
  return text
    .replace(/postgres(?:ql)?:\/\/[^\s'"]+/gi, "postgresql://[redacted]")
    .replace(/rediss?:\/\/[^\s'"]+/gi, "redis://[redacted]")
    .replace(/sk[-_](?:live|test)[_-][A-Za-z0-9]+/g, "[redacted]")
    .replace(/pk[-_](?:live|test)[_-][A-Za-z0-9]+/g, "[redacted]")
    .replace(/whsec_[A-Za-z0-9]+/g, "[redacted]")
    .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/[A-Za-z0-9+/]{32,}={0,2}/g, "[redacted]");
}

export function assertSmokeDoesNotChargeOrPublish() {
  if (isStripeLiveKeyBlocked() || stripeSecretMode() === "LIVE") {
    throw new Error("Stripe LIVE keys are blocked; smoke will not run.");
  }
}

function pushLog(logs: string[], line: string) {
  logs.push(line);
  process.stdout.write(`${line}\n`);
}

function result(name: SmokeCheckName, ok: boolean, skipped: boolean, detail: string): SmokeCheckResult {
  return { name, ok, skipped, detail: redactSmokeText(detail) };
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function runProductionE2ESmoke(
  source: NodeJS.ProcessEnv = process.env,
): Promise<ProductionSmokeResult> {
  const logs: string[] = [];
  const checks: SmokeCheckResult[] = [];
  const live = requireLiveSmoke(source);
  const previousEnv = {
    ALLOW_EXTERNAL_AI_PROCESSING: process.env.ALLOW_EXTERNAL_AI_PROCESSING,
    ALLOW_SOCIAL_PUBLISH: process.env.ALLOW_SOCIAL_PUBLISH,
  };

  try {
    assertSmokeDoesNotChargeOrPublish();
    if (live) {
      process.env.ALLOW_EXTERNAL_AI_PROCESSING = "false";
      process.env.ALLOW_SOCIAL_PUBLISH = "false";
    }

    if (live && externalAiProcessingAllowed()) {
      throw new Error("ALLOW_EXTERNAL_AI_PROCESSING must be false during production smoke");
    }
    if (live && socialPublishAllowed()) {
      throw new Error("ALLOW_SOCIAL_PUBLISH must be false during production smoke");
    }

    checks.push(await checkDatabase());
    const redis = await checkRedis(live);
    checks.push(redis);
    checks.push(await checkR2(live));
    const redisReady = redis.ok && !redis.skipped;
    checks.push(...(await checkQueueAndWorker(live, redisReady)));
    checks.push(await checkProcessingJob());
    checks.push(await checkUploadSession());

    for (const name of SMOKE_CHECKS) {
      const check = checks.find((item) => item.name === name);
      if (!check) {
        pushLog(logs, smokeFailLine(name));
        continue;
      }
      pushLog(logs, check.ok ? smokeOkLine(check.name) : smokeFailLine(check.name));
    }

    const ok = SMOKE_CHECKS.every((name) => checks.find((item) => item.name === name)?.ok);
    pushLog(logs, ok ? SMOKE_PASS_LINE : SMOKE_FAIL_LINE);
    return { ok, checks, logs };
  } catch (error) {
    const message = redactSmokeText(error instanceof Error ? error.message : "unexpected error");
    pushLog(logs, `E2E SMOKE: FAIL ${message}`);
    return { ok: false, checks, logs };
  } finally {
    if (previousEnv.ALLOW_EXTERNAL_AI_PROCESSING === undefined) delete process.env.ALLOW_EXTERNAL_AI_PROCESSING;
    else process.env.ALLOW_EXTERNAL_AI_PROCESSING = previousEnv.ALLOW_EXTERNAL_AI_PROCESSING;
    if (previousEnv.ALLOW_SOCIAL_PUBLISH === undefined) delete process.env.ALLOW_SOCIAL_PUBLISH;
    else process.env.ALLOW_SOCIAL_PUBLISH = previousEnv.ALLOW_SOCIAL_PUBLISH;
    await closeSmokeConnections();
  }
}

async function checkDatabase(): Promise<SmokeCheckResult> {
  try {
    const { prisma } = await import("@/lib/db/prisma");
    await prisma.$queryRaw`SELECT 1`;
    return result("DATABASE", true, false, "SELECT 1");
  } catch (error) {
    return result("DATABASE", false, false, error instanceof Error ? error.message : "database error");
  }
}

async function checkRedis(live: boolean): Promise<SmokeCheckResult> {
  const { isRedisConfigured, createRedisConnection } = await import("@/lib/queue/redis");
  if (!isRedisConfigured()) {
    if (live) return result("REDIS", false, false, "REDIS_URL missing");
    return result("REDIS", true, true, "skipped (no REDIS_URL in local smoke)");
  }
  const redis = createRedisConnection();
  if (!redis) return result("REDIS", false, false, "redis client missing");
  try {
    const pong = await redis.ping();
    if (String(pong).toUpperCase() !== "PONG") throw new Error("unexpected ping");
    return result("REDIS", true, false, "PONG");
  } catch (error) {
    return result("REDIS", false, false, error instanceof Error ? error.message : "redis error");
  } finally {
    redis.disconnect();
  }
}

async function checkR2(live: boolean): Promise<SmokeCheckResult> {
  const provider = (process.env.STORAGE_PROVIDER ?? "local").trim().toLowerCase();
  if (provider === "local" || !directObjectUploadEnabled()) {
    if (live) return result("R2", false, false, "object storage not configured");
    return result("R2", true, true, "skipped (local disk storage)");
  }
  const { getStorage, resetStorageCache } = await import("@/lib/storage");
  resetStorageCache();
  const storage = getStorage();
  const key = `cliplab/e2e-smoke/${randomUUID()}.txt`;
  const body = Buffer.from("cliplab-e2e-smoke");
  try {
    await storage.putObject(key, body, "text/plain");
    const info = await storage.stat(key);
    if (!info.size) throw new Error("HEAD empty");
    const got = await storage.getObject(key);
    if (got.toString("utf8") !== body.toString("utf8")) throw new Error("GET mismatch");
    await storage.deleteObject(key);
    if (await storage.exists(key)) throw new Error("object lingered after delete");
    return result("R2", true, false, `${storage.name} put/head/get/delete`);
  } catch (error) {
    try {
      await storage.deleteObject(key);
    } catch {
      /* best-effort cleanup */
    }
    return result("R2", false, false, error instanceof Error ? error.message : "r2 error");
  }
}

async function checkQueueAndWorker(live: boolean, redisReady: boolean): Promise<SmokeCheckResult[]> {
  if (!redisReady) {
    if (live) {
      return [
        result("QUEUE", false, false, "redis required"),
        result("WORKER", false, false, "redis required"),
      ];
    }
    return [
      result("QUEUE", true, true, "skipped (no Redis in local smoke)"),
      result("WORKER", true, true, "skipped (no worker on this machine)"),
    ];
  }

  try {
    const { enqueue, getQueue, jobIdentityKey } = await import("@/lib/queue");
    const { HEALTHCHECK_RESULT_PREFIX } = await import("@/workers/healthcheck");
    const { workerRuntimeStatus } = await import("@/lib/queue/heartbeat");
    const { getSharedRedis } = await import("@/lib/queue/redis");

    const queue = getQueue("healthcheck");
    if (!queue) {
      return [result("QUEUE", false, false, "healthcheck queue missing"), result("WORKER", false, false, "queue missing")];
    }

    const payload = {
      jobId: `e2e-smoke-${randomUUID()}`,
      workspaceId: "system",
      entityId: "e2e-smoke",
      type: "healthcheck" as const,
    };
    const enqueued = await enqueue("healthcheck", payload);
    if (enqueued.mocked || enqueued.mode !== "redis") {
      return [
        result("QUEUE", false, false, "job stayed in process memory"),
        result("WORKER", false, false, "queue not redis"),
      ];
    }

    let workerOk = (await workerRuntimeStatus()) === "CONNECTED";
    if (live) {
      const started = Date.now();
      const redis = getSharedRedis();
      const bullId = jobIdentityKey("healthcheck", payload);
      while (Date.now() - started < 45_000) {
        const state = await queue
          .getJob(bullId)
          .then((job) => job?.getState())
          .catch(() => "missing");
        const marker = redis ? await redis.get(`${HEALTHCHECK_RESULT_PREFIX}${payload.jobId}`) : null;
        if (state === "completed" || marker === "completed") {
          workerOk = true;
          break;
        }
        if (state === "failed") {
          return [
            result("QUEUE", true, false, "healthcheck enqueued"),
            result("WORKER", false, false, "healthcheck failed"),
          ];
        }
        await sleep(400);
      }
      if (!workerOk) {
        return [
          result("QUEUE", true, false, "healthcheck enqueued"),
          result("WORKER", false, false, "worker heartbeat missing or healthcheck not completed"),
        ];
      }
    }

    return [
      result("QUEUE", true, false, "healthcheck enqueued"),
      result("WORKER", live ? workerOk : true, !live && !workerOk, live ? "healthcheck/heartbeat" : "skipped wait (local)"),
    ];
  } catch (error) {
    return [
      result("QUEUE", false, false, error instanceof Error ? error.message : "queue error"),
      result("WORKER", false, false, "queue error"),
    ];
  }
}

async function checkProcessingJob(): Promise<SmokeCheckResult> {
  try {
    const { prisma } = await import("@/lib/db/prisma");
    await prisma.processingJob.findMany({ take: 1, select: { id: true, status: true } });
    return result("PROCESSINGJOB", true, false, "schema readable");
  } catch (error) {
    return result("PROCESSINGJOB", false, false, error instanceof Error ? error.message : "processingjob error");
  }
}

async function checkUploadSession(): Promise<SmokeCheckResult> {
  try {
    const { prisma } = await import("@/lib/db/prisma");
    await prisma.uploadSession.findMany({ take: 1, select: { id: true, status: true } });
    return result("UPLOADSESSION", true, false, "schema readable");
  } catch (error) {
    return result("UPLOADSESSION", false, false, error instanceof Error ? error.message : "uploadsession error");
  }
}

async function closeSmokeConnections() {
  try {
    const { prisma } = await import("@/lib/db/prisma");
    await prisma.$disconnect();
  } catch {
    /* ignore */
  }
  try {
    const { resetRedisCache } = await import("@/lib/queue/redis");
    resetRedisCache();
  } catch {
    /* ignore */
  }
}
