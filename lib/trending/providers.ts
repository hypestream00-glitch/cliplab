import { TRENDING_CATEGORIES } from "@/lib/competitions/platforms";

export type TrendingKind = "content" | "live";

export type TrendingProviderItem = {
  externalId: string;
  platform: "YOUTUBE" | "TWITCH" | "KICK" | "TIKTOK" | "INSTAGRAM" | "BILIBILI";
  title: string;
  creatorName?: string | null;
  thumbnailUrl?: string | null;
  canonicalUrl: string;
  viewCount?: number | null;
  engagement?: number | null;
  publishedAt?: Date | null;
  durationSeconds?: number | null;
  category: (typeof TRENDING_CATEGORIES)[number];
  kind?: TrendingKind;
  region?: string | null;
  channelId?: string | null;
};

export type TrendingProviderResult = {
  platform: TrendingProviderItem["platform"];
  available: boolean;
  reason?: string;
  items: TrendingProviderItem[];
};

export type TrendingFetchDeps = {
  fetchImpl?: typeof fetch;
  youtubeApiKey?: string;
  twitchClientId?: string;
  twitchClientSecret?: string;
  kickClientId?: string;
  kickClientSecret?: string;
  region?: string;
  youtubeCategoryId?: string;
};

export function youtubeApiKeyFromEnv(source: NodeJS.ProcessEnv = process.env) {
  return source.YOUTUBE_API_KEY?.trim() || source.GOOGLE_API_KEY?.trim() || "";
}

export function trendingFetchDepsFromEnv(source: NodeJS.ProcessEnv = process.env): TrendingFetchDeps {
  return {
    youtubeApiKey: youtubeApiKeyFromEnv(source),
    twitchClientId: source.TWITCH_CLIENT_ID?.trim() || "",
    twitchClientSecret: source.TWITCH_CLIENT_SECRET?.trim() || "",
    kickClientId: source.KICK_CLIENT_ID?.trim() || "",
    kickClientSecret: source.KICK_CLIENT_SECRET?.trim() || "",
    region: source.TRENDING_YOUTUBE_REGION?.trim() || "BR",
  };
}

export function isYouTubeTrendingConfigured(source: NodeJS.ProcessEnv = process.env) {
  return Boolean(youtubeApiKeyFromEnv(source));
}

export function isTwitchTrendingConfigured(source: NodeJS.ProcessEnv = process.env) {
  return Boolean(source.TWITCH_CLIENT_ID?.trim() && source.TWITCH_CLIENT_SECRET?.trim());
}

export function isKickTrendingConfigured(source: NodeJS.ProcessEnv = process.env) {
  return Boolean(source.KICK_CLIENT_ID?.trim() && source.KICK_CLIENT_SECRET?.trim());
}

export function parseIso8601Duration(value: string) {
  const match = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/i.exec(value);
  if (!match) return null;
  return Number(match[1] ?? 0) * 3600 + Number(match[2] ?? 0) * 60 + Number(match[3] ?? 0);
}

export function mapYouTubeCategory(categoryId?: string, title = ""): (typeof TRENDING_CATEGORIES)[number] {
  if (/podcast/i.test(title)) return "Podcasts";
  switch (categoryId) {
    case "20":
      return "Games";
    case "24":
      return "Entretenimento";
    case "17":
      return "Esportes";
    case "25":
      return "Notícias";
    case "10":
      return "Música";
    case "22":
      return "Pessoas";
    default:
      return "Outros";
  }
}

export function youtubeCategoryIdForFilter(category?: string) {
  switch (category) {
    case "Games":
      return "20";
    case "Entretenimento":
      return "24";
    case "Esportes":
      return "17";
    case "Notícias":
      return "25";
    case "Música":
      return "10";
    case "Pessoas":
      return "22";
    default:
      return "";
  }
}
