import type { SocialPlatform } from "@/generated/prisma/client";
import { envFlagOrDefault } from "@/lib/env/status";
import { isYouTubeConfigured, youtubeUploadStatus } from "@/lib/social/youtube/config";
import { isTikTokConfigured, tiktokContentPostingStatus } from "@/lib/social/tiktok/config";
import { isMetaConfigured, metaInsightsStatus, metaPublishingStatus } from "@/lib/social/meta/config";
import { isTwitchTrendingConfigured, isYouTubeTrendingConfigured, youtubeApiKeyFromEnv } from "@/lib/trending/providers";
import { isKickConfigured, isKickTrendingConfigured } from "@/lib/social/kick/config";
import { isBilibiliConfigured, isBilibiliPublishingApproved } from "@/lib/social/bilibili/config";
import { isTwitchOAuthConfigured } from "@/lib/social/twitch/config";
import { isUploadPostPrimary } from "@/lib/social/router";
import { isUploadPostConfigured } from "@/lib/social/upload-post/config";

export const ECOSYSTEM_PLATFORMS = ["TWITCH", "YOUTUBE", "BILIBILI", "TIKTOK", "INSTAGRAM", "KICK"] as const;
export type EcosystemPlatform = (typeof ECOSYSTEM_PLATFORMS)[number];

export type CapabilityState = "AVAILABLE" | "NOT_CONFIGURED" | "NOT_SUPPORTED" | "REQUIRES_APPROVAL" | "BETA";

export type EcosystemCapability =
  | "trending"
  | "oauth"
  | "accountProfile"
  | "ownPosts"
  | "postMetrics"
  | "publish"
  | "live"
  | "liveMetrics"
  | "importMetadata"
  | "importMedia"
  | "competitionTracking";

export type PlatformCapabilities = Record<EcosystemCapability, CapabilityState>;

export type PlatformCapabilityMatrix = Record<EcosystemPlatform, PlatformCapabilities>;

const LIMITED_TRENDING = "Esta plataforma não disponibiliza tendências públicas pela integração atual.";

function flagOn(name: string, fallback = true) {
  return envFlagOrDefault(name, fallback);
}

function unavailable(supported: boolean, configured: boolean, approval = false): CapabilityState {
  if (!supported) return "NOT_SUPPORTED";
  if (!configured) return "NOT_CONFIGURED";
  if (approval) return "REQUIRES_APPROVAL";
  return "AVAILABLE";
}

export function platformEnabled(platform: EcosystemPlatform, source: NodeJS.ProcessEnv = process.env) {
  const key =
    platform === "YOUTUBE"
      ? "ENABLE_YOUTUBE"
      : platform === "BILIBILI"
        ? "ENABLE_BILIBILI"
        : platform === "TIKTOK"
          ? "ENABLE_TIKTOK"
          : platform === "INSTAGRAM"
            ? "ENABLE_INSTAGRAM"
            : platform === "KICK"
              ? "ENABLE_KICK"
              : "ENABLE_TWITCH";
  return envFlagOrDefault(key, true, source);
}

export function resolvePlatformCapabilities(source: NodeJS.ProcessEnv = process.env): PlatformCapabilityMatrix {
  const unified = isUploadPostPrimary() && isUploadPostConfigured();
  const youtubeKey = Boolean(youtubeApiKeyFromEnv(source));
  const youtubeOAuth = isYouTubeConfigured();
  const youtubeTrendingOn = flagOn("ENABLE_YOUTUBE_TRENDING") && isYouTubeTrendingConfigured(source);
  const youtubeLiveOn = youtubeKey;
  const youtubePublish =
    youtubeUploadStatus() === "AVAILABLE"
      ? "AVAILABLE"
      : youtubeOAuth
        ? "REQUIRES_APPROVAL"
        : "NOT_CONFIGURED";
  const tiktokOAuth = isTikTokConfigured();
  const tiktokPublishNative = tiktokContentPostingStatus() === "AVAILABLE";
  const metaOAuth = isMetaConfigured();
  const igPublishNative = metaPublishingStatus("instagram") === "AVAILABLE";
  const igInsights = metaInsightsStatus() === "AVAILABLE";
  const kickCreds = isKickConfigured(source);
  const kickTrending = flagOn("ENABLE_KICK_TRENDING") && isKickTrendingConfigured(source);
  const twitchCreds = isTwitchOAuthConfigured(source) || isTwitchTrendingConfigured(source);
  const bilibiliCreds = isBilibiliConfigured(source);
  const bilibiliPublish = isBilibiliPublishingApproved();

  const matrix: PlatformCapabilityMatrix = {
    TWITCH: {
      trending: unavailable(true, isTwitchTrendingConfigured(source)),
      oauth: unavailable(true, isTwitchOAuthConfigured()),
      accountProfile: unavailable(true, isTwitchOAuthConfigured()),
      ownPosts: "NOT_SUPPORTED",
      postMetrics: "NOT_SUPPORTED",
      publish: "NOT_SUPPORTED",
      live: unavailable(true, twitchCreds),
      liveMetrics: unavailable(true, twitchCreds),
      importMetadata: "AVAILABLE",
      importMedia: "NOT_SUPPORTED",
      competitionTracking: "NOT_SUPPORTED",
    },
    YOUTUBE: {
      trending: unavailable(true, youtubeTrendingOn),
      oauth: unavailable(true, youtubeOAuth),
      accountProfile: unavailable(true, youtubeOAuth),
      ownPosts: unavailable(true, youtubeOAuth),
      postMetrics: unavailable(true, youtubeOAuth),
      publish: youtubePublish,
      live: unavailable(true, youtubeLiveOn),
      liveMetrics: unavailable(true, youtubeLiveOn),
      importMetadata: "AVAILABLE",
      importMedia: "NOT_SUPPORTED",
      competitionTracking: unavailable(true, youtubeOAuth),
    },
    BILIBILI: {
      trending: "NOT_SUPPORTED",
      oauth: unavailable(true, bilibiliCreds),
      accountProfile: unavailable(true, bilibiliCreds),
      ownPosts: bilibiliCreds ? "REQUIRES_APPROVAL" : "NOT_CONFIGURED",
      postMetrics: bilibiliCreds ? "REQUIRES_APPROVAL" : "NOT_CONFIGURED",
      publish: bilibiliCreds ? (bilibiliPublish ? "AVAILABLE" : "REQUIRES_APPROVAL") : "NOT_CONFIGURED",
      live: "NOT_SUPPORTED",
      liveMetrics: "NOT_SUPPORTED",
      importMetadata: "AVAILABLE",
      importMedia: "NOT_SUPPORTED",
      competitionTracking: "NOT_SUPPORTED",
    },
    TIKTOK: {
      trending: "NOT_SUPPORTED",
      oauth: unavailable(true, tiktokOAuth),
      accountProfile: unavailable(true, tiktokOAuth),
      ownPosts: unavailable(true, tiktokOAuth),
      postMetrics: unavailable(true, tiktokOAuth),
      publish: unified
        ? "AVAILABLE"
        : tiktokPublishNative
          ? "AVAILABLE"
          : tiktokOAuth
            ? "REQUIRES_APPROVAL"
            : "NOT_CONFIGURED",
      live: "NOT_SUPPORTED",
      liveMetrics: "NOT_SUPPORTED",
      importMetadata: "AVAILABLE",
      importMedia: "NOT_SUPPORTED",
      competitionTracking: unavailable(true, tiktokOAuth || unified),
    },
    INSTAGRAM: {
      trending: "NOT_SUPPORTED",
      oauth: unavailable(true, metaOAuth),
      accountProfile: unavailable(true, metaOAuth),
      ownPosts: unavailable(true, metaOAuth),
      postMetrics: metaOAuth ? (igInsights ? "AVAILABLE" : "REQUIRES_APPROVAL") : "NOT_CONFIGURED",
      publish: unified ? "AVAILABLE" : igPublishNative ? "AVAILABLE" : metaOAuth ? "REQUIRES_APPROVAL" : "NOT_CONFIGURED",
      live: "NOT_SUPPORTED",
      liveMetrics: "NOT_SUPPORTED",
      importMetadata: "AVAILABLE",
      importMedia: "NOT_SUPPORTED",
      competitionTracking: unavailable(true, metaOAuth || unified),
    },
    KICK: {
      trending: unavailable(true, kickTrending),
      oauth: unavailable(true, kickCreds),
      accountProfile: unavailable(true, kickCreds),
      ownPosts: "NOT_SUPPORTED",
      postMetrics: "NOT_SUPPORTED",
      publish: "NOT_SUPPORTED",
      live: unavailable(true, kickCreds),
      liveMetrics: unavailable(true, kickCreds),
      importMetadata: unavailable(true, kickCreds),
      importMedia: "NOT_SUPPORTED",
      competitionTracking: "NOT_SUPPORTED",
    },
  };

  for (const platform of ECOSYSTEM_PLATFORMS) {
    if (!platformEnabled(platform, source)) {
      for (const key of Object.keys(matrix[platform]) as EcosystemCapability[]) {
        if (matrix[platform][key] === "AVAILABLE" || matrix[platform][key] === "BETA") {
          matrix[platform][key] = "NOT_CONFIGURED";
        }
      }
    }
  }
  return matrix;
}

export function getPlatformCapabilities(platform: EcosystemPlatform, source?: NodeJS.ProcessEnv) {
  return resolvePlatformCapabilities(source)[platform];
}

export function capabilityLabel(state: CapabilityState) {
  switch (state) {
    case "AVAILABLE":
      return "Disponível";
    case "NOT_CONFIGURED":
      return "Aguardando credenciais";
    case "NOT_SUPPORTED":
      return "Não suportado pela API oficial";
    case "REQUIRES_APPROVAL":
      return "Requer aprovação da plataforma";
    case "BETA":
      return "Beta";
  }
}

export function trendingUnavailableReason(platform: EcosystemPlatform) {
  if (platform === "BILIBILI") return "Dados de tendências indisponíveis via API oficial.";
  return LIMITED_TRENDING;
}

export function isEcosystemPlatform(value: string): value is EcosystemPlatform {
  return (ECOSYSTEM_PLATFORMS as readonly string[]).includes(value);
}

export function asEcosystemPlatform(platform: SocialPlatform | string): EcosystemPlatform | null {
  return isEcosystemPlatform(platform) ? platform : null;
}

export const CAPABILITY_LABELS: Record<EcosystemCapability, string> = {
  trending: "Em Alta",
  oauth: "OAuth",
  accountProfile: "Perfil",
  ownPosts: "Vídeos próprios",
  postMetrics: "Analytics",
  publish: "Publicação",
  live: "Ao vivo",
  liveMetrics: "Métricas de live",
  importMetadata: "Preview por link",
  importMedia: "Importar mídia",
  competitionTracking: "Campeonatos",
};
