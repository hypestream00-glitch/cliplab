import { prisma } from "@/lib/db/prisma";
import { computeTrendScore } from "@/lib/trending/score";
import { TRENDING_CATEGORIES, TRENDING_PLATFORMS } from "@/lib/competitions/platforms";
import { isKickTrendingConfigured, isTwitchTrendingConfigured, isYouTubeTrendingConfigured } from "@/lib/trending/providers";
import { resolvePlatformCapabilities } from "@/lib/platforms/capabilities";
import { sortTrendingItems, trendingListWhere, type TrendingListParams } from "@/lib/trending/filters";

export { TRENDING_CATEGORIES, TRENDING_PLATFORMS };
export { sortTrendingItems, trendingListWhere };
export type { TrendingListParams };

export async function listTrendingItems(params: TrendingListParams) {
  const items = await prisma.trendingItem.findMany({
    where: trendingListWhere(params),
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
      kind: item.kind,
    });
    return { ...item, trendScore: computed.score, trendInputs: computed.inputs };
  });
  return sortTrendingItems(scored, params.sort ?? "hot");
}

export function trendingProviderAvailability(source: NodeJS.ProcessEnv = process.env) {
  const caps = resolvePlatformCapabilities(source);
  return {
    YOUTUBE: caps.YOUTUBE.trending === "AVAILABLE" && isYouTubeTrendingConfigured(source),
    TWITCH: caps.TWITCH.trending === "AVAILABLE" && isTwitchTrendingConfigured(source),
    BILIBILI: false,
    KICK: caps.KICK.trending === "AVAILABLE" && isKickTrendingConfigured(source),
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
      kind: item.kind,
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
