import { beforeEach, describe, expect, it, vi } from "vitest";

const countSessions = vi.fn();
const createSession = vi.fn();
const updateSession = vi.fn();
const updateManySessions = vi.fn();
const findFirstSession = vi.fn();
const findManySessions = vi.fn();
const findSource = vi.fn();
const createProject = vi.fn();
const exists = vi.fn();
const stat = vi.fn();
const getSignedUploadUrl = vi.fn();
const deleteObject = vi.fn();

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    uploadSession: {
      count: (...args: unknown[]) => countSessions(...args),
      create: (...args: unknown[]) => createSession(...args),
      update: (...args: unknown[]) => updateSession(...args),
      updateMany: (...args: unknown[]) => updateManySessions(...args),
      findFirst: (...args: unknown[]) => findFirstSession(...args),
      findMany: (...args: unknown[]) => findManySessions(...args),
    },
    sourceVideo: { findFirst: (...args: unknown[]) => findSource(...args) },
  },
}));

vi.mock("@/lib/storage", () => ({
  randomStorageKey: (filename: string, prefix: string) => `${prefix}/abc123${filename.slice(filename.lastIndexOf("."))}`,
  getStorage: () => ({
    getSignedUploadUrl: (...args: unknown[]) => getSignedUploadUrl(...args),
    exists: (...args: unknown[]) => exists(...args),
    stat: (...args: unknown[]) => stat(...args),
    deleteObject: (...args: unknown[]) => deleteObject(...args),
  }),
}));

vi.mock("@/lib/services/projects", () => ({
  createProject: (...args: unknown[]) => createProject(...args),
}));

vi.mock("@/lib/billing/usage", () => ({
  PlanLimitError: class PlanLimitError extends Error {
    name = "PlanLimitError";
  },
  getWorkspacePlanCode: async () => "PRO",
  getMonthlyUsage: async () => ({ remainingSeconds: 3600 }),
}));

function pendingSession(overrides: Record<string, unknown> = {}) {
  return {
    id: "upl_1",
    workspaceId: "ws_a",
    userId: "user_a",
    storageKey: "ws/ws_a/uploads/upl_1/abc123.mp4",
    originalName: "clip.mp4",
    expectedMime: "video/mp4",
    expectedSize: BigInt(100),
    status: "PENDING",
    expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    projectId: null,
    errorMessage: null,
    ...overrides,
  };
}

const projectInput = {
  name: "Teste",
  sourceKind: "UPLOAD" as const,
  sourceUrl: "",
  language: "pt-BR",
  intervalSeconds: 0,
  clipDuration: "15-30" as const,
  clipCount: 5,
  mode: "AUTOMATIC" as const,
  detectSpeakers: true,
  removeSilences: true,
  autoReframe: true,
  autoCaptions: true,
  viralScore: true,
  generateTitle: true,
  generateDescription: true,
  generateHashtags: true,
  authorized: true as const,
  outputAspect: "9:16" as const,
};

describe("upload session security and idempotency", () => {
  beforeEach(() => {
    vi.stubEnv("STORAGE_PROVIDER", "r2");
    vi.stubEnv("S3_BUCKET", "cliplab-media");
    vi.stubEnv("S3_ACCESS_KEY_ID", "test");
    vi.stubEnv("S3_SECRET_ACCESS_KEY", "test");
    countSessions.mockReset().mockResolvedValue(0);
    createSession.mockReset();
    updateSession.mockReset().mockResolvedValue({});
    updateManySessions.mockReset();
    findFirstSession.mockReset();
    findManySessions.mockReset();
    findSource.mockReset().mockResolvedValue(null);
    createProject.mockReset().mockResolvedValue({ id: "proj_1" });
    exists.mockReset().mockResolvedValue(true);
    stat.mockReset().mockResolvedValue({ size: 100, mtime: new Date(), contentType: "video/mp4" });
    getSignedUploadUrl.mockReset().mockResolvedValue({
      url: "https://r2.example/signed",
      method: "PUT",
      expiresAt: new Date(Date.now() + 20 * 60 * 1000),
      headers: { "Content-Type": "video/mp4" },
    });
    deleteObject.mockReset();
  });

  it("requires auth-owned workspace data and rejects oversize/invalid init payloads", async () => {
    const { initUploadSchema, initUploadSession } = await import("@/lib/uploads/session");
    expect(initUploadSchema.safeParse({ filename: "../x.mp4", contentType: "video/mp4", fileSize: 10 }).success).toBe(
      false,
    );
    expect(initUploadSchema.safeParse({ filename: "a.mp4", contentType: "video/mp4", fileSize: 0 }).success).toBe(false);
    expect(
      initUploadSchema.safeParse({ filename: "a.mp4", contentType: "video/mp4", fileSize: 11 * 1024 * 1024 * 1024 })
        .success,
    ).toBe(false);

    createSession.mockResolvedValue({ id: "upl_1", expiresAt: new Date(Date.now() + 1200000) });
    const result = await initUploadSession({
      workspaceId: "ws_a",
      userId: "user_a",
      filename: "talk.mp4",
      contentType: "video/mp4",
      fileSize: 100,
    });
    expect(result.uploadId).toBe("upl_1");
    expect(result.directToObjectStorage).toBe(true);
    expect(result.url).toContain("https://r2.example/signed");
    expect(getSignedUploadUrl).toHaveBeenCalledWith(expect.stringMatching(/^ws\/ws_a\/uploads\/upl_1\//), 20 * 60, "video/mp4");
    expect(createSession.mock.calls[0][0].data.workspaceId).toBe("ws_a");
    expect(createSession.mock.calls[0][0].data).not.toHaveProperty("clientWorkspaceId");
  });

  it("isolates complete to the caller workspace (IDOR)", async () => {
    const { completeUploadSession, UploadSessionError } = await import("@/lib/uploads/session");
    findFirstSession.mockResolvedValue(null);
    await expect(
      completeUploadSession({ workspaceId: "ws_b", uploadId: "upl_1", project: projectInput }),
    ).rejects.toBeInstanceOf(UploadSessionError);
    expect(findFirstSession).toHaveBeenCalledWith({ where: { id: "upl_1", workspaceId: "ws_b" } });
    expect(createProject).not.toHaveBeenCalled();
  });

  it("verifies object HEAD before creating a project and is safe on double complete", async () => {
    const { completeUploadSession } = await import("@/lib/uploads/session");
    findFirstSession.mockResolvedValue(pendingSession());
    updateManySessions.mockResolvedValue({ count: 1 });
    const first = await completeUploadSession({ workspaceId: "ws_a", uploadId: "upl_1", project: projectInput });
    expect(first).toEqual({ projectId: "proj_1", duplicate: false });
    expect(exists).toHaveBeenCalledWith("ws/ws_a/uploads/upl_1/abc123.mp4");
    expect(stat).toHaveBeenCalled();
    expect(createProject).toHaveBeenCalledTimes(1);

    findFirstSession.mockResolvedValue(pendingSession({ projectId: "proj_1", status: "COMPLETED" }));
    const second = await completeUploadSession({ workspaceId: "ws_a", uploadId: "upl_1", project: projectInput });
    expect(second).toEqual({ projectId: "proj_1", duplicate: true });
    expect(createProject).toHaveBeenCalledTimes(1);
  });

  it("fails zero-byte and size-mismatch uploads without creating a project", async () => {
    const { completeUploadSession } = await import("@/lib/uploads/session");
    const { InvalidVideoError } = await import("@/lib/media/validate");
    findFirstSession.mockResolvedValue(pendingSession());
    updateManySessions.mockResolvedValue({ count: 1 });
    stat.mockResolvedValue({ size: 0, mtime: new Date() });
    await expect(
      completeUploadSession({ workspaceId: "ws_a", uploadId: "upl_1", project: projectInput }),
    ).rejects.toBeInstanceOf(InvalidVideoError);
    expect(createProject).not.toHaveBeenCalled();

    findFirstSession.mockResolvedValue(pendingSession());
    updateManySessions.mockResolvedValue({ count: 1 });
    exists.mockResolvedValue(true);
    stat.mockResolvedValue({ size: 50, mtime: new Date() });
    await expect(
      completeUploadSession({ workspaceId: "ws_a", uploadId: "upl_1", project: projectInput }),
    ).rejects.toBeInstanceOf(InvalidVideoError);
    expect(createProject).not.toHaveBeenCalled();
  });

  it("rejects MIME mismatch, expired sessions and aborts orphan objects", async () => {
    const { completeUploadSession, abortUploadSession, UploadSessionError, completeUploadSchema } = await import(
      "@/lib/uploads/session"
    );
    const { InvalidVideoError } = await import("@/lib/media/validate");

    findFirstSession.mockResolvedValue(pendingSession());
    updateManySessions.mockResolvedValue({ count: 1 });
    stat.mockResolvedValue({ size: 100, mtime: new Date(), contentType: "text/plain" });
    await expect(
      completeUploadSession({ workspaceId: "ws_a", uploadId: "upl_1", project: projectInput }),
    ).rejects.toBeInstanceOf(InvalidVideoError);
    expect(createProject).not.toHaveBeenCalled();

    findFirstSession.mockResolvedValue(pendingSession({ expiresAt: new Date(Date.now() - 1000), status: "PENDING" }));
    await expect(
      completeUploadSession({ workspaceId: "ws_a", uploadId: "upl_1", project: projectInput }),
    ).rejects.toBeInstanceOf(UploadSessionError);

    findFirstSession.mockResolvedValue(pendingSession());
    await abortUploadSession("ws_a", "upl_1");
    expect(deleteObject).toHaveBeenCalledWith("ws/ws_a/uploads/upl_1/abc123.mp4");
    expect(updateSession).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "EXPIRED" }) }),
    );

    const sneaky = completeUploadSchema.parse({ ...projectInput, storageKey: "ws/other/secret.mp4", workspaceId: "ws_b" });
    expect("storageKey" in sneaky).toBe(false);
    expect("workspaceId" in sneaky).toBe(false);
  });
});
