import { afterEach, describe, expect, it } from "vitest";
import { sanitizeKey } from "@/lib/storage/url";
import { keyBelongsToWorkspace, projectObjectKey, workspacePrefix } from "@/lib/storage/keys";
import { getStorage, resetStorageCache, randomStorageKey } from "@/lib/storage";
import { toDbJobStatus, toPublicJobStatus } from "@/lib/jobs/status";
import { storageFeatureCode } from "@/lib/features/availability";
import { resumeJobDecision } from "@/lib/pipeline/resume-decision";

describe("storage keys and isolation", () => {
  it("rejects path traversal", () => {
    expect(() => sanitizeKey("../secret.mp4")).not.toThrow();
    expect(sanitizeKey("../secret.mp4")).not.toContain("..");
    expect(() => sanitizeKey("ok/\0bad")).toThrow();
  });

  it("keeps workspace prefixes isolated", () => {
    const a = workspacePrefix("ws_a");
    const key = projectObjectKey({
      workspaceId: "ws_a",
      projectId: "proj_1",
      kind: "clips",
      filename: "clip.mp4",
    });
    expect(keyBelongsToWorkspace(key, "ws_a")).toBe(true);
    expect(keyBelongsToWorkspace(key, "ws_b")).toBe(false);
    expect(keyBelongsToWorkspace(`uploads/ws_a/file.mp4`, "ws_a")).toBe(true);
    expect(key.startsWith(a)).toBe(true);
  });

  it("uses unpredictable object names", () => {
    const first = randomStorageKey("video.mp4", "uploads/ws_a");
    const second = randomStorageKey("video.mp4", "uploads/ws_a");
    expect(first).not.toBe(second);
    expect(first).toMatch(/^uploads\/ws_a\/[a-f0-9]{24}\.mp4$/);
  });
});

describe("storage provider selection", () => {
  afterEach(() => {
    resetStorageCache();
    delete process.env.STORAGE_PROVIDER;
    delete process.env.S3_BUCKET;
    delete process.env.S3_ACCESS_KEY_ID;
    delete process.env.S3_SECRET_ACCESS_KEY;
  });

  it("keeps local storage for development", () => {
    process.env.STORAGE_PROVIDER = "local";
    resetStorageCache();
    expect(getStorage().name).toBe("local");
    expect(storageFeatureCode()).toBe("LOCAL_ONLY");
  });

  it("does not silently fall back to disk when S3 is selected without credentials", async () => {
    process.env.STORAGE_PROVIDER = "s3";
    delete process.env.S3_BUCKET;
    delete process.env.S3_ACCESS_KEY_ID;
    delete process.env.S3_SECRET_ACCESS_KEY;
    resetStorageCache();
    const storage = getStorage();
    expect(storage.name).toBe("s3");
    expect(storageFeatureCode()).toBe("CONFIG_REQUIRED");
    await expect(storage.putObject("ws/a/file.mp4", Buffer.from("x"), "video/mp4")).rejects.toThrow(/not configured/i);
  });

  it("issues expiring local signed URLs", async () => {
    process.env.STORAGE_PROVIDER = "local";
    resetStorageCache();
    const signed = await getStorage().getSignedUrl("uploads/ws_a/file.mp4", 60);
    expect(signed.url).toContain("/api/media?key=");
    expect(signed.expiresAt.getTime()).toBeGreaterThan(Date.now());
    const upload = await getStorage().getSignedUploadUrl("uploads/ws_a/file.mp4", 60, "video/mp4");
    expect(upload.method).toBe("PUT");
  });
});

describe("direct upload keys", () => {
  it("scopes upload objects to workspace and randomizes the filename", async () => {
    const { uploadObjectKey } = await import("@/lib/uploads/policy");
    const key = uploadObjectKey("ws_a", "upl_1", "video.mp4");
    expect(keyBelongsToWorkspace(key, "ws_a")).toBe(true);
    expect(keyBelongsToWorkspace(key, "ws_b")).toBe(false);
    expect(key).toMatch(/^ws\/ws_a\/uploads\/upl_1\/[a-f0-9]{24}\.mp4$/);
  });
});

describe("job lifecycle aliases", () => {
  it("maps QUEUED/PROCESSING onto persisted statuses", () => {
    expect(toDbJobStatus("QUEUED")).toBe("WAITING");
    expect(toDbJobStatus("PROCESSING")).toBe("ACTIVE");
    expect(toPublicJobStatus("WAITING")).toBe("QUEUED");
    expect(toPublicJobStatus("ACTIVE")).toBe("PROCESSING");
  });

  it("does not relaunch in-flight jobs", () => {
    expect(resumeJobDecision("WAITING")).toBe("skip");
    expect(resumeJobDecision("ACTIVE")).toBe("skip");
    expect(resumeJobDecision("FAILED")).toBe("reuse");
  });
});

describe("storage failure", () => {
  afterEach(() => {
    resetStorageCache();
    delete process.env.STORAGE_PROVIDER;
    delete process.env.S3_BUCKET;
    delete process.env.S3_ACCESS_KEY_ID;
    delete process.env.S3_SECRET_ACCESS_KEY;
  });

  it("treats missing objects as absent without throwing on exists", async () => {
    process.env.STORAGE_PROVIDER = "s3";
    delete process.env.S3_BUCKET;
    resetStorageCache();
    await expect(getStorage().exists("ws/a/missing.mp4")).resolves.toBe(false);
    await expect(getStorage().getSignedUrl("ws/a/file.mp4", 30)).rejects.toThrow(/not configured/i);
  });
});
