import { envTruthy } from "@/lib/env/status";
import { oauthCallbackUrl } from "@/lib/env/app-url";

export const X_AUTHORIZE_URL = "https://x.com/i/oauth2/authorize";
export const X_TOKEN_URL = "https://api.x.com/2/oauth2/token";
export const X_REVOKE_URL = "https://api.x.com/2/oauth2/revoke";
export const X_API_BASE = "https://api.x.com/2";

/** Official OAuth 2.0 scopes for user context + media upload + refresh. */
export const X_SCOPES = ["tweet.read", "tweet.write", "users.read", "offline.access", "media.write"] as const;

export function xClientId() {
  return (process.env.X_CLIENT_ID ?? "").trim();
}

export function xClientSecret() {
  return (process.env.X_CLIENT_SECRET ?? "").trim();
}

export function xRedirectUri() {
  return oauthCallbackUrl("X");
}

export function isXConfigured() {
  return Boolean(xClientId() && xClientSecret());
}

export function xOAuthStatus(): "CONFIGURED" | "NOT CONFIGURED" {
  return isXConfigured() ? "CONFIGURED" : "NOT CONFIGURED";
}

/**
 * Write/media posting on X depends on Developer API access + paid tier (Basic/Pro/Enterprise).
 * Free tier typically cannot post. CortaClip never fakes a successful post.
 */
export function xPublishingStatus(): "AVAILABLE" | "API ACCESS REQUIRED" | "PLAN REQUIRED" | "CONFIGURATION REQUIRED" {
  if (!isXConfigured()) return "CONFIGURATION REQUIRED";
  const tier = (process.env.X_API_TIER ?? "").trim().toLowerCase();
  if (envTruthy("X_WRITE_ACCESS_APPROVED")) return "AVAILABLE";
  if (tier === "basic" || tier === "pro" || tier === "enterprise") return "AVAILABLE";
  if (tier === "free") return "PLAN REQUIRED";
  return "API ACCESS REQUIRED";
}

export function xPublishingAllowed() {
  const status = xPublishingStatus();
  return status === "AVAILABLE";
}
