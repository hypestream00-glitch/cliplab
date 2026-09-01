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
    },
    trendingScore: {
      create: async () => ({ id: "s1" }),
    },
  },
}));

vi.mock("@/lib/trending/cache", () => ({
  readTrendingCache: vi.fn(async () => null),
  writeTrendingCache: vi.fn(async () => true),
  youtubeTrendingCacheKey: (region = "BR") => `trending:youtube:${region}`,
  twitchTrendingCacheKey: () => "trending:twitch:popular",
}));

import { persistTrendingItems } from "@/lib/trending/refresh";
import { readFileSync } from "node:fs";

describe("trending persist and worker refresh", () => {
  beforeEach(() => {
    store.clear();
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

  it("refreshes trending from the worker scheduler, not the web server", () => {
    const scheduler = readFileSync("lib/queue/scheduler.ts", "utf8");
    const analytics = readFileSync("workers/analytics.ts", "utf8");
    expect(scheduler).toContain("refreshTrendingCatalog");
    expect(analytics).toContain("refreshTrendingCatalog");
    expect(scheduler).not.toContain("setInterval(() => refreshTrendingCatalog");
  });
});
