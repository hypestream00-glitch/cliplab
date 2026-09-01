import { prisma } from "@/lib/db/prisma";
import { computeTrendScore } from "@/lib/trending/score";
import { TRENDING_CATEGORIES, TRENDING_PLATFORMS } from "@/lib/competitions/platforms";
import { isTwitchTrendingConfigured, isYouTubeTrendingConfigured } from "@/lib/trending/providers";

export { TRENDING_CATEGORIES, TRENDING_PLATFORMS };

export async function listTrendingItems(params: {
  platform?: string;
  category?: string;
  sort?: string;
}) {
  const items = await prisma.trendingItem.findMany({
    where: {
      active: true,
      platform: params.platform && params.platform !== "ALL" ? params.platform : undefined,
      category: params.category && params.category !== "ALL" ? params.category : undefined,
    },
    include: { scores: { orderBy: { computedAt: "desc" }, take: 1 } },
    take: 60,
  });
  const scored = items.map((item) => {
    const computed = computeTrendScore({
      viewCount: item.viewCount,
      views24h: item.views24h,
      views7d: item.views7d,
      engagement: item.engagement,
      publishedAt: item.publishedAt,
    });
    return { ...item, trendScore: computed.score, trendInputs: computed.inputs };
  });
  const sort = params.sort ?? "hot";
  scored.sort((a, b) => {
    if (sort === "views") return (b.viewCount ?? -1) - (a.viewCount ?? -1);
    if (sort === "fast") return (b.views24h ?? -1) - (a.views24h ?? -1);
    if (sort === "recent") {
      return (b.publishedAt?.getTime() ?? 0) - (a.publishedAt?.getTime() ?? 0);
    }
    return (b.trendScore ?? -1) - (a.trendScore ?? -1);
  });
  return scored;
}

export function trendingProviderAvailability(source: NodeJS.ProcessEnv = process.env) {
  return {
    YOUTUBE: isYouTubeTrendingConfigured(source),
    TWITCH: isTwitchTrendingConfigured(source),
    KICK: false,
    TIKTOK: false,
    INSTAGRAM: false,
  } as const;
}

export async function persistTrendScores() {
  const items = await prisma.trendingItem.findMany({ where: { active: true } });
  const now = new Date();
  for (const item of items) {
    const computed = computeTrendScore({
      viewCount: item.viewCount,
      views24h: item.views24h,
      views7d: item.views7d,
      engagement: item.engagement,
      publishedAt: item.publishedAt,
    });
    await prisma.trendingScore.create({
      data: {
        itemId: item.id,
        score: computed.score,
        computedAt: now,
        inputs: computed.inputs,
      },
    });
  }
}
