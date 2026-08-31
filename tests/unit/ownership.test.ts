import { describe, expect, it, vi, beforeEach } from "vitest";

const findSource = vi.fn();
const findClip = vi.fn();
const findAsset = vi.fn();
const findUpload = vi.fn();

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    sourceVideo: { findFirst: (...args: unknown[]) => findSource(...args) },
    clip: { findFirst: (...args: unknown[]) => findClip(...args) },
    renderedAsset: { findFirst: (...args: unknown[]) => findAsset(...args) },
    uploadSession: { findFirst: (...args: unknown[]) => findUpload(...args) },
  },
}));

describe("media ownership", () => {
  beforeEach(() => {
    findSource.mockReset();
    findClip.mockReset();
    findAsset.mockReset();
    findUpload.mockReset();
    findUpload.mockResolvedValue(null);
  });

  it("rejects keys that do not belong to the workspace", async () => {
    findSource.mockResolvedValue(null);
    findClip.mockResolvedValue(null);
    findAsset.mockResolvedValue(null);
    const { authorizeMediaKey } = await import("@/lib/media/authorize");
    expect(await authorizeMediaKey("ws_a", "uploads/other/file.mp4")).toBeNull();
    expect(findSource).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ project: { workspaceId: "ws_a" } }),
    }));
    expect(findClip).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ workspaceId: "ws_a" }),
    }));
  });

  it("allows overlay keys only for the same workspace prefix", async () => {
    const { authorizeMediaKey } = await import("@/lib/media/authorize");
    const ok = await authorizeMediaKey("ws_a", "overlays/ws_a/logo.png");
    expect(ok?.key).toBe("overlays/ws_a/logo.png");
    expect(await authorizeMediaKey("ws_a", "overlays/ws_b/logo.png")).toBeNull();
  });

  it("does not authorize another workspace upload session object", async () => {
    findSource.mockResolvedValue(null);
    findClip.mockResolvedValue(null);
    findAsset.mockResolvedValue(null);
    findUpload.mockResolvedValue(null);
    const { authorizeMediaKey } = await import("@/lib/media/authorize");
    expect(await authorizeMediaKey("ws_b", "ws/ws_a/uploads/upl_1/abc.mp4")).toBeNull();
    expect(findUpload).not.toHaveBeenCalled();
  });
});
