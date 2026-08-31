import { afterEach, describe, expect, it, vi } from "vitest";
import { enqueue, QueueUnavailableError, queueMode, isProductionRuntime, jobIdentityKey, QUEUE_RETRY } from "@/lib/queue";
import { workerConcurrency, isRedisConfigured, resetRedisCache } from "@/lib/queue/redis";
import { shouldEmbedWorkers } from "@/lib/queue/runtime";
import { shouldRecoverPersistedJob } from "@/lib/jobs/recovery-policy";
import { evaluateInfraPreflight } from "@/lib/preflight/infra";
import { storageFeatureCode } from "@/lib/features/availability";

describe("production queue", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    resetRedisCache();
  });

  it("does not pretend local memory is Redis in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("REDIS_URL", "");
    resetRedisCache();
    expect(isRedisConfigured()).toBe(false);
    expect(queueMode()).toBe("unavailable");
    await expect(
      enqueue("notifications", {
        jobId: "job_n",
        workspaceId: "ws_a",
        entityId: "mail_1",
        type: "notifications",
      }),
    ).rejects.toBeInstanceOf(QueueUnavailableError);
  });

  it("keeps an explicit local fallback outside production", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("REDIS_URL", "");
    resetRedisCache();
    expect(isProductionRuntime()).toBe(false);
    expect(queueMode()).toBe("local");
  });

  it("caps worker concurrency", () => {
    vi.stubEnv("WORKER_CONCURRENCY", "99");
    expect(workerConcurrency("video-import")).toBe(8);
    vi.stubEnv("WORKER_CONCURRENCY", "2");
    expect(workerConcurrency("notifications")).toBe(2);
  });

  it("does not embed workers when CLIPLAB_EMBED_WORKERS is false", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("CLIPLAB_EMBED_WORKERS", "false");
    expect(shouldEmbedWorkers()).toBe(false);
  });
});

describe("retry, recovery, idempotency", () => {
  it("retries with exponential backoff", () => {
    expect(QUEUE_RETRY.attempts).toBe(3);
    expect(QUEUE_RETRY.backoff.type).toBe("exponential");
    expect(QUEUE_RETRY.backoff.delay).toBe(4000);
  });

  it("uses a stable identity key so duplicate enqueue is idempotent", () => {
    const payload = { jobId: "job_1", workspaceId: "ws_a", entityId: "proj_1", type: "video-import" as const };
    expect(jobIdentityKey("video-import", payload)).toBe(jobIdentityKey("video-import", payload));
    expect(jobIdentityKey("video-import", payload)).not.toBe(
      jobIdentityKey("render", { ...payload, type: "render" }),
    );
  });

  it("recovers interrupted ACTIVE jobs only when the worker is down and stale", () => {
    const now = new Date("2026-08-31T00:20:00Z");
    const startedAt = new Date("2026-08-31T00:00:00Z");
    expect(
      shouldRecoverPersistedJob({
        status: "ACTIVE",
        createdAt: startedAt,
        startedAt,
        workerStatus: "NOT RUNNING",
        now,
      }),
    ).toBe(true);
    expect(
      shouldRecoverPersistedJob({
        status: "ACTIVE",
        createdAt: startedAt,
        startedAt,
        workerStatus: "CONNECTED",
        now,
      }),
    ).toBe(false);
    expect(
      shouldRecoverPersistedJob({
        status: "COMPLETED",
        createdAt: startedAt,
        startedAt,
        workerStatus: "NOT RUNNING",
        now,
      }),
    ).toBe(false);
  });
});

describe("production preflight", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("fails production when storage, redis or worker are missing", () => {
    const result = evaluateInfraPreflight({
      nodeEnv: "production",
      storageProvider: "local",
      redisUrl: "",
      workerRunning: false,
    });
    expect(result.storage.ok).toBe(false);
    expect(result.redis.ok).toBe(false);
    expect(result.worker.ok).toBe(false);
    expect(result.queue.ok).toBe(false);
    expect(result.directUpload.ok).toBe(false);
    expect(result.productionReady).toBe(false);
  });

  it("is production-ready only with S3, Redis and a live worker", () => {
    const result = evaluateInfraPreflight({
      nodeEnv: "production",
      storageProvider: "s3",
      s3Bucket: "cliplab",
      s3AccessKeyId: "id",
      s3SecretAccessKey: "secret",
      redisUrl: "redis://127.0.0.1:6379",
      workerRunning: true,
      appUrl: "https://app.example.com",
    });
    expect(result.storage.detail).toBe("S3 CONNECTED");
    expect(result.redis.detail).toBe("CONNECTED");
    expect(result.worker.detail).toBe("CONNECTED");
    expect(result.queue.detail).toBe("READY");
    expect(result.directUpload.detail).toBe("SIGNED PUT READY");
    expect(result.appUrl.ok).toBe(true);
    expect(result.productionReady).toBe(true);
  });

  it("fails production when APP_URL is localhost", () => {
    const result = evaluateInfraPreflight({
      nodeEnv: "production",
      storageProvider: "s3",
      s3Bucket: "cliplab",
      s3AccessKeyId: "id",
      s3SecretAccessKey: "secret",
      redisUrl: "redis://127.0.0.1:6379",
      workerRunning: true,
      appUrl: "http://localhost:3000",
    });
    expect(result.appUrl.ok).toBe(false);
    expect(result.productionReady).toBe(false);
  });

  it("accepts local fallback with warnings in development", () => {
    const result = evaluateInfraPreflight({
      nodeEnv: "development",
      storageProvider: "local",
      redisUrl: "",
      workerRunning: false,
    });
    expect(result.storage.ok).toBe("warn");
    expect(result.redis.ok).toBe("warn");
    expect(result.worker.ok).toBe("warn");
    expect(result.directUpload.ok).toBe("warn");
    expect(result.productionReady).toBe(false);
  });

  it("marks local disk as ERROR in production feature code", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("STORAGE_PROVIDER", "local");
    expect(storageFeatureCode()).toBe("ERROR");
  });
});
