import { afterEach, describe, expect, it, vi } from "vitest";
import {
  alwaysOnQueueConsumers,
  estimateIdleRedisCommandsPerHour,
  shouldStartQueueConsumer,
  redisIdleDiagnosticLines,
} from "@/lib/queue/consumers";
import { getSharedRedis, resetRedisCache } from "@/lib/queue/redis";
import { cachedRedisPing, resetRedisHealthCache } from "@/lib/queue/redis-health";
import { recordRedisUsage, resetRedisUsageForTests, redisUsageDiagnosticText } from "@/lib/queue/redis-usage";
import { startWorkerScheduler, stopWorkerScheduler, workerSchedulerActive } from "@/lib/queue/scheduler";
import { LOG_REDACT_PATHS } from "@/lib/logger";

vi.mock("@/lib/email/outbox", () => ({
  processEmailOutbox: vi.fn(async () => ({ processed: 0 })),
}));
vi.mock("@/lib/services/job-recovery", () => ({
  recoverPersistedJobs: vi.fn(async () => 0),
}));
vi.mock("@/lib/queue/heartbeat", () => ({
  beatWorker: vi.fn(async () => undefined),
}));
vi.mock("@/lib/uploads/session", () => ({
  cleanupExpiredUploads: vi.fn(async () => undefined),
}));

describe("redis idle policy", () => {
  afterEach(() => {
    stopWorkerScheduler();
    resetRedisCache();
    resetRedisHealthCache();
    resetRedisUsageForTests();
    vi.unstubAllEnvs();
  });

  it("does not start social, analytics, or infra-probe consumers in production", () => {
    const prod = { NODE_ENV: "production", ALLOW_SOCIAL_PUBLISH: "false" } as NodeJS.ProcessEnv;
    expect(shouldStartQueueConsumer("social-publishing", prod)).toBe(false);
    expect(shouldStartQueueConsumer("analytics-sync", prod)).toBe(false);
    expect(shouldStartQueueConsumer("infra-probe", prod)).toBe(false);
    expect(shouldStartQueueConsumer("live-monitor", prod)).toBe(false);
    expect(shouldStartQueueConsumer("video-import", prod)).toBe(true);
    expect(shouldStartQueueConsumer("healthcheck", prod)).toBe(true);
    expect(alwaysOnQueueConsumers()).toEqual(["video-import", "render", "bulk-download", "healthcheck"]);
  });

  it("starts social-publishing only when publishing is allowed", () => {
    expect(shouldStartQueueConsumer("social-publishing", { NODE_ENV: "production", ALLOW_SOCIAL_PUBLISH: "true" })).toBe(
      true,
    );
  });

  it("registers a single scheduler timer and clears it on stop", () => {
    expect(workerSchedulerActive()).toBe(false);
    startWorkerScheduler();
    startWorkerScheduler();
    expect(workerSchedulerActive()).toBe(true);
    stopWorkerScheduler();
    expect(workerSchedulerActive()).toBe(false);
  });

  it("reuses the shared Redis client", () => {
    vi.stubEnv("REDIS_URL", "rediss://example.internal:6379");
    resetRedisCache();
    const first = getSharedRedis();
    const second = getSharedRedis();
    expect(first).toBe(second);
    expect(first).not.toBeNull();
  });

  it("estimates idle Redis usage far below the previous 5s x 7 worker poll", () => {
    const after = estimateIdleRedisCommandsPerHour();
    const before = estimateIdleRedisCommandsPerHour({
      consumers: 7,
      drainDelaySec: 5,
      stalledIntervalMs: 30_000,
      heartbeatPerHour: 240,
    });
    expect(after.total).toBeLessThan(before.total / 5);
    expect(after.total).toBeLessThan(1000);
    expect(after.drainDelaySec).toBe(30);
  });

  it("does not claim under 100 commands/hour while BullMQ workers long-poll", () => {
    const idle = estimateIdleRedisCommandsPerHour();
    expect(idle.total).toBeGreaterThan(100);
  });

  it("prints a secret-free usage diagnostic", () => {
    recordRedisUsage("recovery", 2);
    const text = redisUsageDiagnosticText();
    expect(text).toContain("REDIS USAGE DIAGNOSTIC:");
    expect(text).toContain("recovery = 2 operations");
    expect(text).not.toMatch(/rediss:\/\/|password|SMTP_/i);
    const lines = redisIdleDiagnosticLines(["video-import"], ["social-publishing"]);
    expect(lines[0]).toBe("REDIS USAGE DIAGNOSTIC:");
    expect(lines.join("\n")).not.toMatch(/rediss:\/\/|REDIS_URL=/);
    expect(LOG_REDACT_PATHS).toContain("REDIS_URL");
  });

  it("health ping does not run without REDIS_URL", async () => {
    vi.stubEnv("REDIS_URL", "");
    vi.stubEnv("NODE_ENV", "development");
    resetRedisCache();
    resetRedisHealthCache();
    expect(await cachedRedisPing(true)).toBe("unset");
  });
});
