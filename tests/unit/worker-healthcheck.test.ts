import { describe, expect, it, vi } from "vitest";
import { logWorkerReadyBanner, workerComponentLines } from "@/lib/queue/worker-preflight";
import { processHealthcheck, HEALTHCHECK_JOB } from "@/workers/healthcheck";
import { QUEUE_NAMES } from "@/lib/queue";

describe("worker ready banner", () => {
  it("prints component status without secrets", () => {
    const lines: string[] = [];
    const spy = vi.spyOn(console, "log").mockImplementation((message: unknown) => {
      lines.push(String(message));
    });
    const input = {
      redisConfigured: true,
      redisPingOk: true,
      databaseOk: true,
      storageOk: true,
      ffmpegOk: true,
    };
    logWorkerReadyBanner(input, true);
    spy.mockRestore();
    expect(lines).toEqual([
      "WORKER STARTED",
      "DATABASE: OK",
      "REDIS: OK",
      "BULLMQ: READY",
      "FFMPEG: OK",
      "WORKER READY",
    ]);
    expect(workerComponentLines({ ...input, databaseOk: false }).database).toBe("FAIL");
    expect(lines.join("\n")).not.toMatch(/postgresql:\/\/|rediss:\/\//i);
  });
});

describe("cliplab-healthcheck", () => {
  it("is registered as a queue and completes without touching projects", async () => {
    expect(QUEUE_NAMES).toContain("healthcheck");
    expect(HEALTHCHECK_JOB).toBe("cliplab-healthcheck");
    const pingDatabase = vi.fn(async () => undefined);
    const markComplete = vi.fn(async () => undefined);
    await processHealthcheck(
      {
        jobId: "hc_test",
        workspaceId: "system",
        entityId: "cliplab-healthcheck",
        type: "healthcheck",
      },
      { pingDatabase, markComplete },
    );
    expect(pingDatabase).toHaveBeenCalledOnce();
    expect(markComplete).toHaveBeenCalledWith("hc_test");
  });
});
