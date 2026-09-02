import type { Prisma } from "@/generated/prisma/client";

export type TrendingListParams = {
  platform?: string;
  category?: string;
  sort?: string;
  region?: string;
};

export function trendingListWhere(params: TrendingListParams): Prisma.TrendingItemWhereInput {
  const platform = params.platform && params.platform !== "ALL" ? params.platform : undefined;
  const category = params.category && params.category !== "ALL" ? params.category : undefined;
  const region = params.region && params.region !== "ALL" && params.region !== "GLOBAL" ? params.region : undefined;
  const where: Prisma.TrendingItemWhereInput = { active: true };
  if (platform) where.platform = platform;
  if (category) where.category = category;
  if (region && platform === "YOUTUBE") {
    where.region = region;
  } else if (region && !platform) {
    where.OR = [{ platform: "YOUTUBE", region }, { platform: { not: "YOUTUBE" } }];
  }
  return where;
}

export function sortTrendingItems<
  T extends {
    viewCount: number | null;
    views24h: number | null;
    publishedAt: Date | null;
    trendScore: number | null;
  },
>(items: T[], sort = "hot"): T[] {
  const scored = [...items];
  scored.sort((a, b) => {
    if (sort === "views") return (b.viewCount ?? Number.NEGATIVE_INFINITY) - (a.viewCount ?? Number.NEGATIVE_INFINITY);
    if (sort === "fast") return (b.views24h ?? Number.NEGATIVE_INFINITY) - (a.views24h ?? Number.NEGATIVE_INFINITY);
    if (sort === "recent") {
      return (b.publishedAt?.getTime() ?? 0) - (a.publishedAt?.getTime() ?? 0);
    }
    return (b.trendScore ?? Number.NEGATIVE_INFINITY) - (a.trendScore ?? Number.NEGATIVE_INFINITY);
  });
  return scored;
}
