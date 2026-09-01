import { describe, expect, it, vi } from "vitest";

const { deleteObject, commitLocalFile } = vi.hoisted(() => ({
  deleteObject: vi.fn(async () => undefined),
  commitLocalFile: vi.fn(async () => undefined),
}));

vi.mock("@/lib/storage", () => ({
  randomStorageKey: (filename: string, prefix: string) => `${prefix}/abc123${filename.slice(filename.lastIndexOf("."))}`,
  getStorage: () => ({ deleteObject }),
}));

vi.mock("@/lib/storage/materialize", () => ({
  commitLocalFile,
  withJobTempDir: async (fn: (dir: string) => Promise<unknown>) => {
    const { mkdtemp, rm } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const path = await import("node:path");
    const dir = await mkdtemp(path.join(tmpdir(), "cliplab-ingest-test-"));
    try {
      return await fn(dir);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  },
}));

import { downloadDirectVideoToStorage } from "@/lib/ingest/download";

function videoFetch(contentType: string, header: Buffer) {
  return vi.fn(async (_url: string, init?: RequestInit) => {
    if (init?.method === "HEAD") {
      return new Response(null, { status: 200, headers: { "content-type": contentType } });
    }
    return new Response(Uint8Array.from(header), { status: 200, headers: { "content-type": contentType } });
  }) as unknown as typeof fetch;
}

describe("ingest storage cleanup", () => {
  it("streams a valid mp4 into storage", async () => {
    commitLocalFile.mockResolvedValueOnce(undefined);
    const payload = Buffer.alloc(32, 1);
    payload.write("ftyp", 4);
    const result = await downloadDirectVideoToStorage({
      workspaceId: "ws_1",
      url: "https://cdn.example.com/clip.mp4",
      maxBytes: 1024 * 1024,
      deps: { fetchImpl: videoFetch("video/mp4", payload), lookup: async () => ["8.8.8.8"] },
    });
    expect(result.mimeType).toBe("video/mp4");
    expect(result.storageKey).toContain("uploads/ws_1/");
    expect(result.storageKey).toMatch(/\.mp4$/);
    expect(commitLocalFile).toHaveBeenCalled();
  });

  it("streams a valid webm into storage", async () => {
    commitLocalFile.mockResolvedValueOnce(undefined);
    const payload = Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    const result = await downloadDirectVideoToStorage({
      workspaceId: "ws_1",
      url: "https://cdn.example.com/clip.webm",
      maxBytes: 1024 * 1024,
      deps: { fetchImpl: videoFetch("video/webm", payload), lookup: async () => ["8.8.8.8"] },
    });
    expect(result.mimeType).toBe("video/webm");
    expect(result.storageKey).toMatch(/\.webm$/);
  });

  it("removes a partial R2 object when commit fails", async () => {
    commitLocalFile.mockRejectedValueOnce(new Error("r2 put failed"));
    const payload = Buffer.alloc(32, 1);
    payload.write("ftyp", 4);
    await expect(
      downloadDirectVideoToStorage({
        workspaceId: "ws_1",
        url: "https://cdn.example.com/clip.mp4",
        maxBytes: 1024 * 1024,
        deps: { fetchImpl: videoFetch("video/mp4", payload), lookup: async () => ["8.8.8.8"] },
      }),
    ).rejects.toMatchObject({ code: "storage" });
    expect(deleteObject).toHaveBeenCalled();
  });
});
