import { describe, expect, it, vi, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  canCleanupOrphanUpload,
  configuredMaxUploadBytes,
  effectiveMaxUploadBytes,
  isUploadExpired,
  objectMatchesExpectedMime,
  objectMatchesExpectedSize,
  SIGNED_PUT_TTL_SEC,
  uploadObjectKey,
} from "@/lib/uploads/policy";
import { validateUploadFile, InvalidVideoError } from "@/lib/media/validate";
import { keyBelongsToWorkspace } from "@/lib/storage/keys";

describe("direct upload policy", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("caps upload size by plan and optional env ceiling", () => {
    vi.stubEnv("MAX_VIDEO_UPLOAD_BYTES", String(50 * 1024 * 1024));
    expect(configuredMaxUploadBytes()).toBe(50 * 1024 * 1024);
    expect(effectiveMaxUploadBytes(10 * 1024 * 1024 * 1024)).toBe(50 * 1024 * 1024);
    expect(effectiveMaxUploadBytes(10 * 1024 * 1024)).toBe(10 * 1024 * 1024);
  });

  it("rejects disallowed mime/extension and empty files", () => {
    expect(() =>
      validateUploadFile({ filename: "notes.txt", mimeType: "text/plain", sizeBytes: 10, maxBytes: 1000 }),
    ).toThrow(InvalidVideoError);
    expect(() =>
      validateUploadFile({ filename: "clip.mp4", mimeType: "video/mp4", sizeBytes: 0, maxBytes: 1000 }),
    ).toThrow(InvalidVideoError);
    expect(() =>
      validateUploadFile({ filename: "clip.mp4", mimeType: "video/mp4", sizeBytes: 2000, maxBytes: 1000 }),
    ).toThrow(InvalidVideoError);
    expect(validateUploadFile({ filename: "clip.mp4", mimeType: "video/mp4", sizeBytes: 10, maxBytes: 1000 }).mime).toBe(
      "video/mp4",
    );
  });

  it("requires exact size after HEAD", () => {
    expect(objectMatchesExpectedSize(100, 0).ok).toBe(false);
    expect(objectMatchesExpectedSize(100, 99).ok).toBe(false);
    expect(objectMatchesExpectedSize(100, 100).ok).toBe(true);
    expect(objectMatchesExpectedSize(BigInt(2048), 2048).ok).toBe(true);
  });

  it("accepts missing or octet-stream HEAD mime and rejects spoofed types", () => {
    expect(objectMatchesExpectedMime("video/mp4", null).ok).toBe(true);
    expect(objectMatchesExpectedMime("video/mp4", "video/mp4").ok).toBe(true);
    expect(objectMatchesExpectedMime("video/mp4", "application/octet-stream").ok).toBe(true);
    expect(objectMatchesExpectedMime("video/mp4", "text/plain").ok).toBe(false);
  });

  it("expires sessions and only cleans orphans without a project", () => {
    const past = new Date("2026-01-01T00:00:00Z");
    const now = new Date("2026-01-01T00:30:00Z");
    expect(isUploadExpired(past, now)).toBe(true);
    expect(SIGNED_PUT_TTL_SEC).toBe(20 * 60);
    expect(canCleanupOrphanUpload({ status: "PENDING", projectId: null, expiresAt: past, now })).toBe(true);
    expect(canCleanupOrphanUpload({ status: "PENDING", projectId: "proj_1", expiresAt: past, now })).toBe(false);
    expect(canCleanupOrphanUpload({ status: "VALIDATING", projectId: null, expiresAt: past, now })).toBe(false);
  });

  it("does not let another workspace guess the object key prefix", () => {
    const key = uploadObjectKey("ws_owner", "upload_1", "../secret.mp4");
    expect(keyBelongsToWorkspace(key, "ws_owner")).toBe(true);
    expect(keyBelongsToWorkspace(key, "ws_other")).toBe(false);
    expect(key).not.toContain("..");
  });
});

describe("direct upload memory path", () => {
  it("streams worker downloads instead of buffering the object", () => {
    const src = readFileSync(path.join(process.cwd(), "lib/storage/materialize.ts"), "utf8");
    expect(src).toContain("pipeline(");
    expect(src).toContain("createReadStream");
    expect(src).not.toMatch(/getObject\(/);
    expect(src).not.toMatch(/arrayBuffer\(/);
  });

  it("sends the browser file to a signed PUT instead of a Server Action", () => {
    const src = readFileSync(path.join(process.cwd(), "app/(studio)/studio/create/create-form.tsx"), "utf8");
    expect(src).toContain("/api/uploads/init");
    expect(src).toContain("xhr.upload.onprogress");
    expect(src).toContain("Cancelar envio");
    expect(src).not.toContain("createProjectAction");
    expect(src).not.toContain("arrayBuffer");
  });

  it("keeps the local streaming PUT off the R2 path", () => {
    const src = readFileSync(path.join(process.cwd(), "app/api/uploads/[id]/put/route.ts"), "utf8");
    expect(src).toContain("pipeline(");
    expect(src).toContain("directObjectUploadEnabled");
    expect(src).not.toMatch(/arrayBuffer\(/);
  });

  it("runs FFprobe before transcription so invalid media never reaches OpenAI", () => {
    const src = readFileSync(path.join(process.cwd(), "lib/services/pipeline.ts"), "utf8");
    expect(src.indexOf("probeVideo")).toBeGreaterThan(-1);
    expect(src.indexOf("probeVideo")).toBeLessThan(src.indexOf("transcribe("));
    expect(src.indexOf("analysisCreditKey")).toBeGreaterThan(src.indexOf("probeVideo"));
  });
});
