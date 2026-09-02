import type { SocialPlatform } from "@/generated/prisma/client";
import { isUploadPostPrimary } from "@/lib/social/router";
import { isUploadPostConfigured } from "@/lib/social/upload-post/config";
import { getSupportedPlatforms } from "@/lib/social/upload-post/platforms";
import { NATIVE_OAUTH_PLATFORMS, PLATFORM_CONNECTION } from "@/lib/platforms/connection-registry";
import { peekUploadPostHealth, shouldCallUploadPostRemote } from "@/lib/social/upload-post/health";

export const YOUTUBE_NATIVE_CONNECT_HREF = "/api/social/oauth/start?platform=YOUTUBE";
export const UPLOAD_POST_CONNECT_HREF = "/api/social/upload-post/connect";

export type AccountsConnectTarget = {
  href: string;
  provider: "YOUTUBE" | "UPLOAD_POST";
  label: string;
};

export { NATIVE_OAUTH_PLATFORMS };

/**
 * Primary CTA on /studio/accounts is always native YouTube OAuth.
 * Never send "+ Conectar conta" to Upload-Post.
 */
export function primaryAccountsConnect(): AccountsConnectTarget {
  return { href: YOUTUBE_NATIVE_CONNECT_HREF, provider: "YOUTUBE", label: "Conectar conta" };
}

export function secondaryAccountsConnect(): AccountsConnectTarget | null {
  if (isUploadPostPrimary() && isUploadPostConfigured() && shouldCallUploadPostRemote()) {
    return { href: UPLOAD_POST_CONNECT_HREF, provider: "UPLOAD_POST", label: "Outras redes" };
  }
  return null;
}

export function shouldPrepareUploadPostProfileOnAccountsLoad() {
  return isUploadPostPrimary() && isUploadPostConfigured() && shouldCallUploadPostRemote();
}

/** Upload-Post failures must not block native YouTube or Twitch connect. */
export function shouldSurfaceUploadPostProfileError() {
  return false;
}

export function uploadPostAccountsWarning() {
  if (!isUploadPostPrimary()) return "";
  if (!isUploadPostConfigured()) return "";
  if (peekUploadPostHealth() === "AUTH_ERROR") {
    return "Integração temporariamente indisponível";
  }
  return "";
}

export function uploadPostGridPlatforms(accounts: { platform: string; provider?: string | null }[]): SocialPlatform[] {
  const platforms = getSupportedPlatforms();
  const keepYouTube = accounts.some((account) => account.platform === "YOUTUBE" && account.provider === "UPLOAD_POST");
  if (PLATFORM_CONNECTION.YOUTUBE.connectionProvider === "GOOGLE_NATIVE" && !keepYouTube) {
    return platforms.filter((platform) => platform !== "YOUTUBE");
  }
  return platforms;
}
