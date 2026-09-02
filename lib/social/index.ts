import type { SocialPlatform } from "@/generated/prisma/client";
import type { SocialProvider, SocialProfile } from "@/lib/social/provider";
import { createMockSocialProvider } from "@/lib/social/mock";
import { isTikTokConfigured } from "@/lib/social/tiktok/config";
import { tiktokProvider, unconfiguredTikTokProvider } from "@/lib/social/tiktok/provider";
import { isMetaConfigured } from "@/lib/social/meta/config";
import { instagramProvider, unconfiguredInstagramProvider } from "@/lib/social/meta/instagram";
import { facebookProvider, unconfiguredFacebookProvider } from "@/lib/social/meta/facebook";
import { isXConfigured } from "@/lib/social/x/config";
import { xProvider, unconfiguredXProvider } from "@/lib/social/x/provider";
import { isYouTubeConfigured } from "@/lib/social/youtube/config";
import { youtubeProvider, unconfiguredYouTubeProvider } from "@/lib/social/youtube/provider";
import { isTwitchOAuthConfigured } from "@/lib/social/twitch/config";
import { twitchOAuthProvider, unconfiguredTwitchProvider } from "@/lib/social/twitch/provider";
import { isKickConfigured } from "@/lib/social/kick/config";
import { kickOAuthProvider, unconfiguredKickProvider } from "@/lib/social/kick/provider";
import { isBilibiliConfigured } from "@/lib/social/bilibili/config";
import { bilibiliOAuthProvider, unconfiguredBilibiliProvider } from "@/lib/social/bilibili/provider";

const OFFICIAL: SocialPlatform[] = ["TIKTOK", "INSTAGRAM", "FACEBOOK", "X", "YOUTUBE", "TWITCH", "KICK", "BILIBILI"];

export function getSocialProvider(platform: SocialPlatform): SocialProvider {
  if (platform === "TIKTOK") {
    return isTikTokConfigured() ? tiktokProvider : unconfiguredTikTokProvider;
  }
  if (platform === "INSTAGRAM") {
    return isMetaConfigured() ? instagramProvider : unconfiguredInstagramProvider;
  }
  if (platform === "FACEBOOK") {
    return isMetaConfigured() ? facebookProvider : unconfiguredFacebookProvider;
  }
  if (platform === "X") {
    return isXConfigured() ? xProvider : unconfiguredXProvider;
  }
  if (platform === "YOUTUBE") {
    return isYouTubeConfigured() ? youtubeProvider : unconfiguredYouTubeProvider;
  }
  if (platform === "TWITCH") {
    return isTwitchOAuthConfigured() ? twitchOAuthProvider : unconfiguredTwitchProvider;
  }
  if (platform === "KICK") {
    return isKickConfigured() ? kickOAuthProvider : unconfiguredKickProvider;
  }
  if (platform === "BILIBILI") {
    return isBilibiliConfigured() ? bilibiliOAuthProvider : unconfiguredBilibiliProvider;
  }
  return createMockSocialProvider(platform);
}

export function isSocialMocked(platform?: SocialPlatform) {
  if (platform && OFFICIAL.includes(platform)) return false;
  if (!platform) {
    return (
      !isTikTokConfigured() &&
      !isMetaConfigured() &&
      !isXConfigured() &&
      !isYouTubeConfigured() &&
      !isTwitchOAuthConfigured() &&
      !isKickConfigured() &&
      !isBilibiliConfigured()
    );
  }
  return createMockSocialProvider(platform).mocked;
}

export type { SocialProfile };
