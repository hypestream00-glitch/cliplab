import { isGoogleOAuthConfigured } from "@/lib/env/server";
import { isTwitchOAuthConfigured } from "@/lib/social/twitch/config";
import { isTikTokConfigured } from "@/lib/social/tiktok/config";
import { isMetaConfigured } from "@/lib/social/meta/config";
import { isKickConfigured } from "@/lib/social/kick/config";
import { isBilibiliConfigured } from "@/lib/social/bilibili/config";
import { isUploadPostConfigured } from "@/lib/social/upload-post/config";
import { peekUploadPostHealth, resolveUploadPostHealth } from "@/lib/social/upload-post/health";
import { PLATFORM_CONNECTION, type IntegrationHealth } from "@/lib/platforms/connection-registry";
import { isYouTubeTrendingConfigured, isTwitchTrendingConfigured } from "@/lib/trending/providers";

export type IntegrationStatusRow = {
  configured: boolean;
  connection: (typeof PLATFORM_CONNECTION)[keyof typeof PLATFORM_CONNECTION]["connectionProvider"] | "UPLOAD_POST";
  status: IntegrationHealth;
};

export async function getIntegrationsStatus() {
  const uploadCached = peekUploadPostHealth();
  const uploadPostStatus: IntegrationHealth = !isUploadPostConfigured()
    ? "NOT_CONFIGURED"
    : uploadCached ?? (await resolveUploadPostHealth());
  const youtubeConfigured = isGoogleOAuthConfigured();
  const twitchConfigured = isTwitchOAuthConfigured();
  return {
    youtube: {
      configured: youtubeConfigured,
      connection: PLATFORM_CONNECTION.YOUTUBE.connectionProvider,
      status: youtubeConfigured ? "READY" : "NOT_CONFIGURED",
    },
    twitch: {
      configured: twitchConfigured,
      connection: PLATFORM_CONNECTION.TWITCH.connectionProvider,
      status: twitchConfigured ? "READY" : "NOT_CONFIGURED",
    },
    tiktok: {
      configured: isTikTokConfigured(),
      connection: PLATFORM_CONNECTION.TIKTOK.connectionProvider,
      status: isTikTokConfigured() ? "READY" : "NOT_CONFIGURED",
    },
    instagram: {
      configured: isMetaConfigured(),
      connection: PLATFORM_CONNECTION.INSTAGRAM.connectionProvider,
      status: isMetaConfigured() ? "READY" : "NOT_CONFIGURED",
    },
    kick: {
      configured: isKickConfigured(),
      connection: PLATFORM_CONNECTION.KICK.connectionProvider,
      status: isKickConfigured() ? "READY" : "NOT_CONFIGURED",
    },
    bilibili: {
      configured: isBilibiliConfigured(),
      connection: PLATFORM_CONNECTION.BILIBILI.connectionProvider,
      status: isBilibiliConfigured() ? "READY" : "NOT_CONFIGURED",
    },
    uploadPost: {
      configured: isUploadPostConfigured(),
      connection: "UPLOAD_POST" as const,
      status: uploadPostStatus,
    },
    youtubeTrending: {
      configured: isYouTubeTrendingConfigured(),
      connection: PLATFORM_CONNECTION.YOUTUBE.connectionProvider,
      status: isYouTubeTrendingConfigured() ? "READY" : "NOT_CONFIGURED",
    },
    twitchTrending: {
      configured: isTwitchTrendingConfigured(),
      connection: PLATFORM_CONNECTION.TWITCH.connectionProvider,
      status: isTwitchTrendingConfigured() ? "READY" : "NOT_CONFIGURED",
    },
  } satisfies Record<string, IntegrationStatusRow>;
}
