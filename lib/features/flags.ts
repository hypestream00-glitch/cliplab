import { envPresent } from "@/lib/env/status";
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
  | "STRIPE_BILLING";

export function featureFlags(): Record<FeatureFlag, boolean> {
  const unified = isUploadPostPrimary() && isUploadPostConfigured();
  return {
    OPENAI_REAL: envPresent("OPENAI_API_KEY"),
    TIKTOK_PUBLISHING: unified || (isTikTokConfigured() && tiktokContentPostingStatus() === "AVAILABLE"),
    META_PUBLISHING:
      unified ||
      (isMetaConfigured() &&
        (metaPublishingStatus("instagram") === "AVAILABLE" || metaPublishingStatus("facebook") === "AVAILABLE")),
    X_PUBLISHING: unified || (isXConfigured() && xPublishingAllowed()),
    YOUTUBE_PUBLISHING: unified || (isYouTubeConfigured() && youtubeUploadStatus() === "AVAILABLE"),
    STRIPE_BILLING: isStripeTestReady(),
  };
}

export function isFeatureEnabled(flag: FeatureFlag) {
  return featureFlags()[flag];
}
