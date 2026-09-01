import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const findFirstProject = vi.fn();
const updateSource = vi.fn();
const createProject = vi.fn();
const previewIngestUrl = vi.fn();
const downloadDirectVideoToStorage = vi.fn();
const deleteObject = vi.fn();

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    project: { findFirst: (...args: unknown[]) => findFirstProject(...args) },
    sourceVideo: { update: (...args: unknown[]) => updateSource(...args) },
  },
}));

vi.mock("@/lib/services/projects", () => ({
  createProject: (...args: unknown[]) => createProject(...args),
}));

vi.mock("@/lib/billing/usage", () => ({
  PlanLimitError: class PlanLimitError extends Error {
    name = "PlanLimitError";
  },
  getMonthlyUsage: async () => ({ remainingSeconds: 3600, effectivePlanCode: "PRO" }),
}));

vi.mock("@/lib/config/plans", async () => {
  const actual = await vi.importActual<typeof import("@/lib/config/plans")>("@/lib/config/plans");
  return {
    ...actual,
    getPlanLimits: () => ({ maxFileSizeBytes: 50 * 1024 * 1024 }),
    clampClipCount: (_plan: string, count: number) => count,
  };
});

vi.mock("@/lib/ingest/preview", () => ({
  previewIngestUrl: (...args: unknown[]) => previewIngestUrl(...args),
  ingestPreviewDepsFromEnv: () => ({}),
}));

vi.mock("@/lib/ingest/download", () => ({
  downloadDirectVideoToStorage: (...args: unknown[]) => downloadDirectVideoToStorage(...args),
}));

vi.mock("@/lib/storage", () => ({
  randomStorageKey: (filename: string, prefix: string) => `${prefix}/abc123${filename.slice(filename.lastIndexOf("."))}`,
  getStorage: () => ({
    deleteObject: (...args: unknown[]) => deleteObject(...args),
  }),
}));

import { importProjectFromUrl, resetIngestImportLocks } from "@/lib/ingest/import";
import { ingestPendingSourceVideo } from "@/lib/ingest/worker-import";
import { IngestError } from "@/lib/ingest/errors";

const baseInput = {
  workspaceId: "ws_1",
  url: "https://cdn.example.com/clip.mp4",
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
  authorized: true,
};

describe("url import job handoff", () => {
  beforeEach(() => {
    findFirstProject.mockReset().mockResolvedValue(null);
    updateSource.mockReset();
    createProject.mockReset().mockResolvedValue({ id: "proj_1" });
    previewIngestUrl.mockReset().mockResolvedValue({
      provider: "DIRECT_URL",
      sourceKind: "DIRECT_URL",
      url: "https://cdn.example.com/clip.mp4",
      title: "clip.mp4",
      creatorName: null,
      thumbnailUrl: null,
      durationSeconds: null,
      platformLabel: "Arquivo direto",
      ingestSupported: true,
      metadataSupported: true,
      availability: "import-ready",
    });
    downloadDirectVideoToStorage.mockReset();
    deleteObject.mockReset();
    resetIngestImportLocks();
  });

  it("creates a queued project without downloading in the API process", async () => {
    const project = await importProjectFromUrl(baseInput);
    expect(project.id).toBe("proj_1");
    expect(downloadDirectVideoToStorage).not.toHaveBeenCalled();
    expect(createProject).toHaveBeenCalledTimes(1);
    const payload = createProject.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.storageKey).toBeUndefined();
    expect(payload.sourceKind).toBe("DIRECT_URL");
    expect(payload.sourceUrl).toBe("https://cdn.example.com/clip.mp4");
    expect(payload.authorized).toBe(true);
    expect(payload.sourceProvider).toBe("DIRECT_URL");
  });

  it("does not import youtube when metadata exists but ingest is unavailable", async () => {
    previewIngestUrl.mockResolvedValue({
      provider: "YOUTUBE",
      sourceKind: "YOUTUBE",
      url: "https://www.youtube.com/watch?v=dQw4w9wgGcQ",
      title: "Never Gonna Give You Up",
      creatorName: "Rick",
      thumbnailUrl: "https://i.ytimg.com/vi/x/hqdefault.jpg",
      durationSeconds: 213,
      platformLabel: "YouTube",
      ingestSupported: false,
      metadataSupported: true,
      availability: "found-no-import",
      message: "Encontramos o vídeo, mas a importação automática desta fonte não está disponível para este conteúdo.",
    });
    await expect(importProjectFromUrl({ ...baseInput, url: "https://www.youtube.com/watch?v=dQw4w9wgGcQ" })).rejects.toMatchObject({
      code: "import-unavailable",
    });
    expect(createProject).not.toHaveBeenCalled();
    expect(downloadDirectVideoToStorage).not.toHaveBeenCalled();
  });

  it("requires rights confirmation before creating an import job", async () => {
    await expect(importProjectFromUrl({ ...baseInput, authorized: false })).rejects.toBeInstanceOf(IngestError);
    expect(createProject).not.toHaveBeenCalled();
  });

  it("reuses an in-flight import for the same workspace url", async () => {
    findFirstProject.mockResolvedValue({ id: "proj_existing" });
    const first = await importProjectFromUrl(baseInput);
    const second = await importProjectFromUrl(baseInput);
    expect(first.id).toBe("proj_existing");
    expect(second.id).toBe("proj_existing");
    expect(createProject).not.toHaveBeenCalled();
  });

  it("dedupes double-clicks in the same process before the project exists", async () => {
    let resolveCreate: ((value: { id: string }) => void) | undefined;
    createProject.mockImplementation(
      () =>
        new Promise<{ id: string }>((resolve) => {
          resolveCreate = resolve;
        }),
    );
    const pendingA = importProjectFromUrl(baseInput);
    const pendingB = importProjectFromUrl(baseInput);
    await vi.waitFor(() => expect(createProject).toHaveBeenCalledTimes(1));
    resolveCreate?.({ id: "proj_locked" });
    const [a, b] = await Promise.all([pendingA, pendingB]);
    expect(a.id).toBe("proj_locked");
    expect(b.id).toBe("proj_locked");
    expect(createProject).toHaveBeenCalledTimes(1);
  });

  it("worker ingest downloads then updates the source for the existing pipeline", async () => {
    downloadDirectVideoToStorage.mockResolvedValue({
      storageKey: "uploads/ws_1/abc.mp4",
      mimeType: "video/mp4",
      sizeBytes: 2048,
      filename: "clip.mp4",
      finalUrl: "https://cdn.example.com/clip.mp4",
    });
    updateSource.mockResolvedValue({});
    const key = await ingestPendingSourceVideo({
      projectId: "proj_1",
      workspaceId: "ws_1",
      source: {
        id: "src_1",
        kind: "DIRECT_URL",
        sourceUrl: "https://cdn.example.com/clip.mp4",
        storageKey: null,
      },
    });
    expect(key).toBe("uploads/ws_1/abc.mp4");
    expect(downloadDirectVideoToStorage).toHaveBeenCalledTimes(1);
    expect(updateSource).toHaveBeenCalledWith({
      where: { id: "src_1" },
      data: {
        storageKey: "uploads/ws_1/abc.mp4",
        mimeType: "video/mp4",
        sizeBytes: 2048,
        originalName: "clip.mp4",
        sourceUrl: "https://cdn.example.com/clip.mp4",
      },
    });
  });

  it("does not download when the source already has storage", async () => {
    const key = await ingestPendingSourceVideo({
      projectId: "proj_1",
      workspaceId: "ws_1",
      source: {
        id: "src_1",
        kind: "DIRECT_URL",
        sourceUrl: "https://cdn.example.com/clip.mp4",
        storageKey: "uploads/ws_1/ready.mp4",
      },
    });
    expect(key).toBe("uploads/ws_1/ready.mp4");
    expect(downloadDirectVideoToStorage).not.toHaveBeenCalled();
  });

  it("refuses youtube in the worker even if a url was queued", async () => {
    await expect(
      ingestPendingSourceVideo({
        projectId: "proj_1",
        workspaceId: "ws_1",
        source: {
          id: "src_1",
          kind: "YOUTUBE",
          sourceUrl: "https://www.youtube.com/watch?v=dQw4w9wgGcQ",
          storageKey: null,
        },
      }),
    ).rejects.toMatchObject({ code: "import-unavailable" });
    expect(downloadDirectVideoToStorage).not.toHaveBeenCalled();
  });
});

describe("pipeline reuse", () => {
  it("hands imported media to the existing video-import pipeline after R2", () => {
    const pipeline = readFileSync(path.join(process.cwd(), "lib/services/pipeline.ts"), "utf8");
    const ingestCall = pipeline.indexOf("await ingestPendingSourceVideo");
    const probeCall = pipeline.indexOf("await probeVideo");
    expect(ingestCall).toBeGreaterThan(-1);
    expect(probeCall).toBeGreaterThan(ingestCall);
    const apiImport = readFileSync(path.join(process.cwd(), "lib/ingest/import.ts"), "utf8");
    expect(apiImport).not.toContain("downloadDirectVideoToStorage");
    const worker = readFileSync(path.join(process.cwd(), "workers/video-processing.ts"), "utf8");
    expect(worker).toContain('createWorker("video-import"');
  });
});
