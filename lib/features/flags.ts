import { envFlagOrDefault, envPresent, socialPublishAllowed, externalAiProcessingAllowed } from "@/lib/env/status";
import { isTikTokConfigured, tiktokContentPostingStatus } from "@/lib/social/tiktok/config";
import { isMetaConfigured, metaPublishingStatus } from "@/lib/social/meta/config";
import { isXConfigured, xPublishingAllowed } from "@/lib/social/x/config";
import { isYouTubeConfigured, youtubeUploadStatus } from "@/lib/social/youtube/config";
import { isStripeTestReady } from "@/lib/billing/stripe-mode";
import { isUploadPostPrimary } from "@/lib/social/router";
import { isUploadPostConfigured } from "@/lib/social/upload-post/config";

export type FeatureFlag =
  | "OPENAI_REAL"
  | "TIKTOK_PUBLISHING"
  | "META_PUBLISHING"
  | "X_PUBLISHING"
  | "YOUTUBE_PUBLISHING"
  | "STRIPE_BILLING"
  | "ENABLE_LIVE_CLIPPING"
  | "ENABLE_TRENDING_YOUTUBE"
  | "ENABLE_TRENDING_TWITCH"
  | "ENABLE_CHAMPIONSHIPS"
  | "ENABLE_AUTOPOST"
  | "ENABLE_YOUTUBE"
  | "ENABLE_BILIBILI"
  | "ENABLE_TIKTOK"
  | "ENABLE_INSTAGRAM"
  | "ENABLE_KICK";

export function featureFlags(): Record<FeatureFlag, boolean> {
  const unified = isUploadPostPrimary() && isUploadPostConfigured();
  return {
    OPENAI_REAL: envPresent("OPENAI_API_KEY") && externalAiProcessingAllowed(),
    TIKTOK_PUBLISHING:
      socialPublishAllowed() && (unified || (isTikTokConfigured() && tiktokContentPostingStatus() === "AVAILABLE")),
    META_PUBLISHING:
      socialPublishAllowed() &&
      (unified ||
        (isMetaConfigured() &&
          (metaPublishingStatus("instagram") === "AVAILABLE" || metaPublishingStatus("facebook") === "AVAILABLE"))),
    X_PUBLISHING: socialPublishAllowed() && (unified || (isXConfigured() && xPublishingAllowed())),
    YOUTUBE_PUBLISHING:
      socialPublishAllowed() && (unified || (isYouTubeConfigured() && youtubeUploadStatus() === "AVAILABLE")),
    STRIPE_BILLING: isStripeTestReady(),
    ENABLE_LIVE_CLIPPING: envFlagOrDefault("ENABLE_LIVE_CLIPPING", true),
    ENABLE_TRENDING_YOUTUBE: envPresent("YOUTUBE_API_KEY") || envPresent("GOOGLE_API_KEY"),
    ENABLE_TRENDING_TWITCH: envPresent("TWITCH_CLIENT_ID") && envPresent("TWITCH_CLIENT_SECRET"),
    ENABLE_CHAMPIONSHIPS: envFlagOrDefault("ENABLE_CHAMPIONSHIPS", true),
    ENABLE_AUTOPOST: envFlagOrDefault("ENABLE_AUTOPOST", true) && socialPublishAllowed(),
    ENABLE_YOUTUBE: envFlagOrDefault("ENABLE_YOUTUBE", true),
    ENABLE_BILIBILI: envFlagOrDefault("ENABLE_BILIBILI", true),
    ENABLE_TIKTOK: envFlagOrDefault("ENABLE_TIKTOK", true),
    ENABLE_INSTAGRAM: envFlagOrDefault("ENABLE_INSTAGRAM", true),
    ENABLE_KICK: envFlagOrDefault("ENABLE_KICK", true),
  };
}

export function isFeatureEnabled(flag: FeatureFlag) {
  return featureFlags()[flag];
}
