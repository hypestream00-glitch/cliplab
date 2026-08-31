import { oauthCallbackUrl } from "@/lib/env/app-url";
import { envTruthy } from "@/lib/env/status";

export const TIKTOK_AUTHORIZE_URL = "https://www.tiktok.com/v2/auth/authorize/";
export const TIKTOK_TOKEN_URL = "https://open.tiktokapis.com/v2/oauth/token/";
export const TIKTOK_REVOKE_URL = "https://open.tiktokapis.com/v2/oauth/revoke/";
export const TIKTOK_API_BASE = "https://open.tiktokapis.com";

/** Scopes requested. TikTok only grants those enabled on the app and accepted by the user. */
export const TIKTOK_SCOPES = [
  "user.info.basic",
  "user.info.profile",
  "user.info.stats",
  "video.list",
  "video.publish",
] as const;

export function tiktokClientKey() {
  return (process.env.TIKTOK_CLIENT_KEY ?? process.env.TIKTOK_CLIENT_ID ?? "").trim();
}

export function tiktokClientSecret() {
  return (process.env.TIKTOK_CLIENT_SECRET ?? "").trim();
}

export function tiktokRedirectUri() {
  return oauthCallbackUrl("TIKTOK");
}

export function isTikTokConfigured() {
  return Boolean(tiktokClientKey() && tiktokClientSecret());
}

export function tiktokContentPostingStatus(): "AVAILABLE" | "NEEDS_APPROVAL" | "UNKNOWN" | "NOT_CONFIGURED" {
  if (!isTikTokConfigured()) return "NOT_CONFIGURED";
  if (envTruthy("TIKTOK_CONTENT_POSTING_APPROVED")) return "AVAILABLE";
  return "NEEDS_APPROVAL";
}

export function tiktokOAuthStatus(): "CONFIGURED" | "NOT CONFIGURED" {
  return isTikTokConfigured() ? "CONFIGURED" : "NOT CONFIGURED";
}
