export const COMPETITION_PLATFORMS = ["TIKTOK", "INSTAGRAM", "YOUTUBE"] as const;
export type CompetitionPlatform = (typeof COMPETITION_PLATFORMS)[number];

export const TRENDING_PLATFORMS = ["YOUTUBE", "TWITCH", "KICK", "TIKTOK", "INSTAGRAM"] as const;
export const TRENDING_CATEGORIES = ["Games", "Podcasts", "Entretenimento", "Esportes", "Notícias", "Outros"] as const;

export function isAllowedCompetitionPlatform(value: string): value is CompetitionPlatform {
  return (COMPETITION_PLATFORMS as readonly string[]).includes(value);
}

export function platformMetricsSupport(platform: string) {
  if (platform === "TIKTOK") {
    return {
      views: true,
      likes: true,
      comments: true,
      shares: true,
      ownership: true,
      limitations: "TikTok video.query só retorna vídeos da conta autenticada. Sem scraping.",
    };
  }
  if (platform === "YOUTUBE") {
    return {
      views: true,
      likes: true,
      comments: true,
      shares: false,
      ownership: true,
      limitations: "Shares do YouTube não existem na Data API. Ownership via channelId.",
    };
  }
  if (platform === "INSTAGRAM") {
    return {
      views: "conditional" as const,
      likes: "conditional" as const,
      comments: "conditional" as const,
      shares: "conditional" as const,
      ownership: true,
      limitations: "Insights exigem instagram_manage_insights. Sem isso as métricas não entram no payout.",
    };
  }
  return {
    views: false,
    likes: false,
    comments: false,
    shares: false,
    ownership: false,
    limitations: "NOT SUPPORTED YET",
  };
}
