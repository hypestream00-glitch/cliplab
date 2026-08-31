import { describe, expect, it } from "vitest";
import { evaluateWorkerPreflight } from "@/lib/queue/worker-preflight";
import { isBlockedIngestUrl } from "@/lib/security/ssrf";
import { getPlanLimits } from "@/lib/config/plans";
import { tenantWhere } from "@/lib/security/tenant";
import { canCancelPublication } from "@/lib/social/publication-status";

describe("worker preflight", () => {
  it("fails when Redis or FFmpeg is missing", () => {
    expect(
      evaluateWorkerPreflight({
        redisConfigured: false,
        redisPingOk: false,
        databaseOk: true,
        storageOk: true,
        ffmpegOk: true,
      }).ok,
    ).toBe(false);
    expect(
      evaluateWorkerPreflight({
        redisConfigured: true,
        redisPingOk: true,
        databaseOk: true,
        storageOk: true,
        ffmpegOk: false,
      }).failures,
    ).toContain("FFmpeg/ffprobe unavailable");
    expect(
      evaluateWorkerPreflight({
        redisConfigured: true,
        redisPingOk: true,
        databaseOk: true,
        storageOk: true,
        ffmpegOk: true,
      }).ok,
    ).toBe(true);
  });
});

describe("ssrf ingest guard", () => {
  it("blocks localhost, metadata and private networks", () => {
    expect(isBlockedIngestUrl("http://127.0.0.1/video.mp4")).toBe(true);
    expect(isBlockedIngestUrl("http://169.254.169.254/latest/meta-data")).toBe(true);
    expect(isBlockedIngestUrl("http://10.0.0.8/clip.mp4")).toBe(true);
    expect(isBlockedIngestUrl("file:///etc/passwd")).toBe(true);
    expect(isBlockedIngestUrl("https://cdn.example.com/video.mp4")).toBe(false);
  });
});

describe("plan and tenant guards", () => {
  it("keeps Pro limits at 1800 minutes, 15 accounts and 40 clips", () => {
    const pro = getPlanLimits("PRO");
    expect(pro.monthlyMinutes).toBe(1800);
    expect(pro.maxAccounts).toBe(15);
    expect(pro.maxClipsPerProject).toBe(40);
    expect(pro.maxResolution).toBe("1080p");
  });

  it("scopes tenant queries by workspaceId", () => {
    expect(tenantWhere("ws_a")).toEqual({ workspaceId: "ws_a" });
  });

  it("only cancels publications that have not started", () => {
    expect(canCancelPublication("QUEUED")).toBe(true);
    expect(canCancelPublication("UPLOADING")).toBe(false);
    expect(canCancelPublication("PUBLISHED")).toBe(false);
  });
});
