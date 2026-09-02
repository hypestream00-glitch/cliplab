import { describe, expect, it, vi } from "vitest";

const redis = {
  get: vi.fn(async () => null as string | null),
  set: vi.fn(async () => "OK"),
};

vi.mock("@/lib/queue/redis", () => ({
  ensureSharedRedis: vi.fn(async () => redis),
}));

import { readTrendingCache, writeTrendingCache, youtubeTrendingCacheKey } from "@/lib/trending/cache";

describe("trending redis cache", () => {
  it("uses trending:youtube:BR:all:popular and a TTL", async () => {
    expect(youtubeTrendingCacheKey("br")).toBe("trending:youtube:BR:all:popular");
    await writeTrendingCache("trending:youtube:BR:all:popular", { platform: "YOUTUBE", available: true, items: [] });
    expect(redis.set).toHaveBeenCalledWith("trending:youtube:BR:all:popular", expect.any(String), "EX", 1800);
    redis.get.mockResolvedValueOnce(JSON.stringify({ platform: "YOUTUBE", available: true, items: [] }));
    const cached = await readTrendingCache<{ platform: string }>("trending:youtube:BR:all:popular");
    expect(cached?.platform).toBe("YOUTUBE");
  });
});
