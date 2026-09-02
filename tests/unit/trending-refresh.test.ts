import { beforeEach, describe, expect, it, vi } from "vitest";

const store = new Map<string, { id: string; viewCount: number | null; updatedAt: Date; externalId: string; platform: string }>();

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    trendingItem: {
      findFirst: async ({ where }: { where: { platform: string; externalId: string } }) =>
        [...store.values()].find((item) => item.platform === where.platform && item.externalId === where.externalId) ?? null,
      create: async ({ data }: { data: { externalId: string; platform: string; viewCount?: number | null } }) => {
        const row = { id: `t_${data.externalId}`, updatedAt: new Date(), viewCount: data.viewCount ?? null, ...data };
        store.set(row.id, row);
        return row;
      },
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: { viewCount?: number | null; views24h?: number | null };
      }) => {
        const current = store.get(where.id)!;
        const row = { ...current, ...data, updatedAt: new Date() };
        store.set(where.id, row);
        return row;
      },
      updateMany: async () => ({ count: 0 }),
      count: async () => 0,
    },
    trendingScore: {
      create: async () => ({ id: "s1" }),
    },
  },
}));

vi.mock("@/lib/trending/cache", () => ({
  readTrendingCache: vi.fn(async () => null),
  writeTrendingCache: vi.fn(async () => true),
  deleteTrendingCache: vi.fn(async () => true),
  youtubeTrendingCacheKey: (region = "BR", category = "all") => `trending:youtube:${region.toUpperCase()}:${category}:popular`,
  youtubeTrendingLegacyCacheKey: (region = "BR") => `trending:youtube:${region.toUpperCase()}`,
  youtubeTrendingCacheKeysForRegion: (region = "BR", category = "all") => [
    `trending:youtube:${region.toUpperCase()}:${category}:popular`,
    `trending:youtube:${region.toUpperCase()}`,
  ],
  invalidateYouTubeTrendingCache: vi.fn(async () => 1),
  shouldCacheYouTubeResult: (result: { available?: boolean; items?: unknown[]; error?: unknown }) =>
    Boolean(result.available && !result.error && result.items && result.items.length > 0),
  isUsableYouTubeCache: (cached: { available?: boolean; items?: unknown[]; error?: unknown } | null) =>
    Boolean(cached?.available && !cached.error && cached.items && cached.items.length > 0),
  isYouTubeErrorCache: (cached: { error?: unknown } | null) => Boolean(cached?.error),
  isStaleEmptyYouTubeCache: (cached: { error?: unknown; available?: boolean; items?: unknown[] } | null) =>
    Boolean(cached && !cached.error && (!cached.available || !cached.items?.length)),
  twitchTrendingCacheKey: () => "trending:twitch:popular",
  kickTrendingCacheKey: () => "trending:kick:livestreams",
  YOUTUBE_ERROR_CACHE_TTL_SEC: 60,
}));

import { persistTrendingItems, collectYouTubeTrending, refreshTrendingCatalog } from "@/lib/trending/refresh";
import { writeTrendingCache } from "@/lib/trending/cache";
import { readFileSync } from "node:fs";

describe("trending persist and worker refresh", () => {
  beforeEach(() => {
    store.clear();
    vi.mocked(writeTrendingCache).mockClear();
  });

  it("does not invent 24h views on the first snapshot", async () => {
    await persistTrendingItems(
      [
        {
          externalId: "abc",
          platform: "YOUTUBE",
          title: "Clip",
          canonicalUrl: "https://www.youtube.com/watch?v=abc",
          viewCount: 1000,
          category: "Games",
        },
      ],
      "youtube-api",
    );
    const saved = [...store.values()][0];
    expect(saved.viewCount).toBe(1000);
    expect((saved as { views24h?: number | null }).views24h ?? null).toBeNull();
  });

  it("records a 24h delta only when a recent previous snapshot exists", async () => {
    const first = {
      id: "t_abc",
      platform: "YOUTUBE",
      externalId: "abc",
      viewCount: 1000,
      updatedAt: new Date(),
    };
    store.set(first.id, first);
    await persistTrendingItems(
      [
        {
          externalId: "abc",
          platform: "YOUTUBE",
          title: "Clip",
          canonicalUrl: "https://www.youtube.com/watch?v=abc",
          viewCount: 1300,
          category: "Games",
        },
      ],
      "youtube-api",
    );
    expect((store.get("t_abc") as { views24h?: number }).views24h).toBe(300);
  });

  it("refreshes youtube regions and twitch from the worker, and the studio page can ensure youtube", () => {
    const scheduler = readFileSync("lib/queue/scheduler.ts", "utf8");
    const analytics = readFileSync("workers/analytics.ts", "utf8");
    const page = readFileSync("app/(studio)/studio/trending/page.tsx", "utf8");
    const refresh = readFileSync("lib/trending/refresh.ts", "utf8");
    expect(scheduler).toContain("refreshTrendingCatalog");
    expect(analytics).toContain("refreshTrendingCatalog");
    expect(scheduler).not.toContain("setInterval(() => refreshTrendingCatalog");
    expect(page).toContain("ensureYouTubeTrendingCatalog");
    expect(refresh).toContain("YOUTUBE_TRENDING_SUPPORTED_REGIONS");
    expect(refresh).toContain("collectTwitchAndKick");
  });

  it("does not cache an empty youtube result as a successful catalog", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ items: [] }), { status: 200 })) as unknown as typeof fetch;
    const result = await collectYouTubeTrending({ youtubeApiKey: "k", region: "BR", fetchImpl });
    expect(result.items).toEqual([]);
    expect(writeTrendingCache).not.toHaveBeenCalled();
  });

  it("caches google quota errors briefly instead of a full success ttl", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(JSON.stringify({ error: { code: 403, errors: [{ reason: "quotaExceeded" }] } }), { status: 403 }),
    ) as unknown as typeof fetch;
    const result = await collectYouTubeTrending({ youtubeApiKey: "k", region: "US", fetchImpl });
    expect(result.error?.reason).toBe("quotaExceeded");
    expect(writeTrendingCache).toHaveBeenCalledWith(
      "trending:youtube:US:all:popular",
      expect.objectContaining({ available: false }),
      60,
    );
  });

  it("refreshes youtube for BR US and PT without dropping twitch collection", async () => {
    const seen: string[] = [];
    const fetchImpl = vi.fn(async (url: string) => {
      const href = String(url);
      if (href.includes("googleapis.com/youtube")) {
        const region = new URL(href).searchParams.get("regionCode") ?? "";
        seen.push(region);
        return new Response(JSON.stringify({ items: [] }), { status: 200 });
      }
      if (href.includes("oauth2/token")) {
        return new Response(JSON.stringify({ access_token: "tok" }), { status: 200 });
      }
      return new Response(JSON.stringify({ data: [] }), { status: 200 });
    }) as unknown as typeof fetch;
    await refreshTrendingCatalog({
      youtubeApiKey: "k",
      twitchClientId: "id",
      twitchClientSecret: "secret",
      fetchImpl,
    });
    expect(seen).toEqual(["BR", "US", "PT"]);
  });
});
