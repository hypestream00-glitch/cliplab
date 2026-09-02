import { oauthCallbackUrl } from "@/lib/env/app-url";

export const KICK_AUTHORIZE_URL = "https://id.kick.com/oauth/authorize";
export const KICK_TOKEN_URL = "https://id.kick.com/oauth/token";
export const KICK_API_BASE = "https://api.kick.com/public/v1";
export const KICK_LIVESTREAMS_URL = "https://api.kick.com/public/v2/livestreams";

export const KICK_SCOPES = ["user:read", "channel:read"] as const;

export function kickClientId(source: NodeJS.ProcessEnv = process.env) {
  return source.KICK_CLIENT_ID?.trim() || "";
}

export function kickClientSecret(source: NodeJS.ProcessEnv = process.env) {
  return source.KICK_CLIENT_SECRET?.trim() || "";
}

export function kickRedirectUri() {
  return oauthCallbackUrl();
}

export function isKickConfigured(source: NodeJS.ProcessEnv = process.env) {
  return Boolean(kickClientId(source) && kickClientSecret(source));
}

export function isKickTrendingConfigured(source: NodeJS.ProcessEnv = process.env) {
  return isKickConfigured(source);
}

export function kickOAuthStatus(): "CONFIGURED" | "NOT CONFIGURED" {
  return isKickConfigured() ? "CONFIGURED" : "NOT CONFIGURED";
}

export function kickScopes() {
  return [...KICK_SCOPES];
}
