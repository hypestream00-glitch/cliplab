import { describe, expect, it, vi } from "vitest";

const redis = {
  get: vi.fn(async () => null as string | null),
  set: vi.fn(async () => "OK"),
  del: vi.fn(async () => 1),
};

vi.mock("@/lib/queue/redis", () => ({
  ensureSharedRedis: vi.fn(async () => redis),
}));

import {
  isStaleEmptyYouTubeCache,
  isUsableYouTubeCache,
  invalidateYouTubeTrendingCache,
  readTrendingCache,
  shouldCacheYouTubeResult,
  writeTrendingCache,
  youtubeTrendingCacheKey,
} from "@/lib/trending/cache";

describe("trending redis cache", () => {
  it("uses trending:youtube:BR:all:popular and a TTL", async () => {
    expect(youtubeTrendingCacheKey("br")).toBe("trending:youtube:BR:all:popular");
    await writeTrendingCache("trending:youtube:BR:all:popular", { platform: "YOUTUBE", available: true, items: [] });
    expect(redis.set).toHaveBeenCalledWith("trending:youtube:BR:all:popular", expect.any(String), "EX", 1800);
    redis.get.mockResolvedValueOnce(JSON.stringify({ platform: "YOUTUBE", available: true, items: [] }));
    const cached = await readTrendingCache<{ platform: string }>("trending:youtube:BR:all:popular");
    expect(cached?.platform).toBe("YOUTUBE");
  });

  it("does not treat an empty youtube payload as a usable cache hit", () => {
    expect(shouldCacheYouTubeResult({ platform: "YOUTUBE", available: true, items: [] })).toBe(false);
    expect(isUsableYouTubeCache({ platform: "YOUTUBE", available: true, items: [] })).toBe(false);
    expect(isStaleEmptyYouTubeCache({ platform: "YOUTUBE", available: true, items: [] })).toBe(true);
  });

  it("invalidates current and legacy youtube trending keys", async () => {
    await invalidateYouTubeTrendingCache("BR");
    expect(redis.del).toHaveBeenCalledWith("trending:youtube:BR:all:popular");
    expect(redis.del).toHaveBeenCalledWith("trending:youtube:BR");
  });
});
