import type { SocialPlatform } from "@/generated/prisma/client";
import { isUploadPostPrimary } from "@/lib/social/router";
import { isUploadPostConfigured } from "@/lib/social/upload-post/config";
import { getSupportedPlatforms } from "@/lib/social/upload-post/platforms";
import { isYouTubeConfigured } from "@/lib/social/youtube/config";

export const YOUTUBE_NATIVE_CONNECT_HREF = "/api/social/oauth/start?platform=YOUTUBE";
export const UPLOAD_POST_CONNECT_HREF = "/api/social/upload-post/connect";

export type AccountsConnectTarget = {
  href: string;
  provider: "YOUTUBE" | "UPLOAD_POST";
  label: string;
};

export const NATIVE_OAUTH_PLATFORMS = ["YOUTUBE", "TWITCH", "KICK", "BILIBILI"] as const;

/** Primary CTA on /studio/accounts. Native YouTube wins over Upload-Post when Google OAuth is configured. */
export function primaryAccountsConnect(): AccountsConnectTarget | null {
  if (isYouTubeConfigured()) {
    return { href: YOUTUBE_NATIVE_CONNECT_HREF, provider: "YOUTUBE", label: "Conectar conta" };
  }
  if (isUploadPostPrimary() && isUploadPostConfigured()) {
    return { href: UPLOAD_POST_CONNECT_HREF, provider: "UPLOAD_POST", label: "Conectar conta" };
  }
  return null;
}

export function secondaryAccountsConnect(): AccountsConnectTarget | null {
  const primary = primaryAccountsConnect();
  if (primary?.provider === "YOUTUBE" && isUploadPostPrimary() && isUploadPostConfigured()) {
    return { href: UPLOAD_POST_CONNECT_HREF, provider: "UPLOAD_POST", label: "Outras redes" };
  }
  return null;
}

export function shouldPrepareUploadPostProfileOnAccountsLoad() {
  return isUploadPostPrimary() && isUploadPostConfigured();
}

/** Do not block the accounts page when native YouTube OAuth is the primary connect path. */
export function shouldSurfaceUploadPostProfileError() {
  return shouldPrepareUploadPostProfileOnAccountsLoad() && !isYouTubeConfigured();
}

export function uploadPostGridPlatforms(accounts: { platform: string; provider?: string | null }[]): SocialPlatform[] {
  const platforms = getSupportedPlatforms();
  const keepYouTube = accounts.some((account) => account.platform === "YOUTUBE" && account.provider === "UPLOAD_POST");
  if (isYouTubeConfigured() && !keepYouTube) {
    return platforms.filter((platform) => platform !== "YOUTUBE");
  }
  return platforms;
}
