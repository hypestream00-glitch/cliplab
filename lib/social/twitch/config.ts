import { oauthCallbackUrl } from "@/lib/env/app-url";

export const TWITCH_AUTHORIZE_URL = "https://id.twitch.tv/oauth2/authorize";
export const TWITCH_TOKEN_URL = "https://id.twitch.tv/oauth2/token";
export const TWITCH_HELIX_BASE = "https://api.twitch.tv/helix";
export const TWITCH_REVOKE_URL = "https://id.twitch.tv/oauth2/revoke";

export const TWITCH_SCOPES = ["user:read:email"] as const;

export function twitchClientId(source: NodeJS.ProcessEnv = process.env) {
  return source.TWITCH_CLIENT_ID?.trim() || "";
}

export function twitchClientSecret(source: NodeJS.ProcessEnv = process.env) {
  return source.TWITCH_CLIENT_SECRET?.trim() || "";
}

export function twitchRedirectUri() {
  return oauthCallbackUrl();
}

export function isTwitchOAuthConfigured(source: NodeJS.ProcessEnv = process.env) {
  return Boolean(twitchClientId(source) && twitchClientSecret(source));
}

export function twitchOAuthStatus(): "CONFIGURED" | "NOT CONFIGURED" {
  return isTwitchOAuthConfigured() ? "CONFIGURED" : "NOT CONFIGURED";
}

export function twitchScopes() {
  return [...TWITCH_SCOPES];
}
