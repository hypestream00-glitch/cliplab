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
  return createMockSocialProvider(platform);
}

export function isSocialMocked(platform?: SocialPlatform) {
  if (platform === "TIKTOK" || platform === "INSTAGRAM" || platform === "FACEBOOK" || platform === "X" || platform === "YOUTUBE") {
    return false;
  }
  if (!platform) return !isTikTokConfigured() && !isMetaConfigured() && !isXConfigured() && !isYouTubeConfigured();
  return createMockSocialProvider(platform).mocked;
}

export type { SocialProvider, SocialProfile };
