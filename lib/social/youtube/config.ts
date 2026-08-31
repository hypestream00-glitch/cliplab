import { envTruthy } from "@/lib/env/status";
import { oauthCallbackUrl } from "@/lib/env/app-url";

export const GOOGLE_AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
export const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
export const GOOGLE_REVOKE_URL = "https://oauth2.googleapis.com/revoke";
export const YOUTUBE_API_BASE = "https://www.googleapis.com/youtube/v3";
export const YOUTUBE_UPLOAD_URL = "https://www.googleapis.com/upload/youtube/v3/videos";

export const YOUTUBE_SCOPES = [
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/youtube.readonly",
] as const;

export const YOUTUBE_ANALYTICS_SCOPE = "https://www.googleapis.com/auth/yt-analytics.readonly";

export function youtubeClientId() {
  return (
    process.env.GOOGLE_CLIENT_ID?.trim() ||
    process.env.YOUTUBE_CLIENT_ID?.trim() ||
    process.env.AUTH_GOOGLE_ID?.trim() ||
    ""
  );
}

export function youtubeClientSecret() {
  return (
    process.env.GOOGLE_CLIENT_SECRET?.trim() ||
    process.env.YOUTUBE_CLIENT_SECRET?.trim() ||
    process.env.AUTH_GOOGLE_SECRET?.trim() ||
    ""
  );
}

export function youtubeRedirectUri() {
  return oauthCallbackUrl("YOUTUBE");
}

export function isYouTubeConfigured() {
  return Boolean(youtubeClientId() && youtubeClientSecret());
}

export function youtubeOAuthStatus(): "CONFIGURED" | "NOT CONFIGURED" {
  return isYouTubeConfigured() ? "CONFIGURED" : "NOT CONFIGURED";
}

export function youtubeUploadStatus(): "AVAILABLE" | "PERMISSION REQUIRED" | "CONFIGURATION REQUIRED" {
  if (!isYouTubeConfigured()) return "CONFIGURATION REQUIRED";
  if (envTruthy("YOUTUBE_UPLOAD_APPROVED")) return "AVAILABLE";
  return "PERMISSION REQUIRED";
}

export function youtubeAnalyticsStatus(): "AVAILABLE" | "PERMISSION REQUIRED" | "CONFIGURATION REQUIRED" {
  if (!isYouTubeConfigured()) return "CONFIGURATION REQUIRED";
  if (envTruthy("YOUTUBE_ANALYTICS_APPROVED")) return "AVAILABLE";
  return "PERMISSION REQUIRED";
}

export function youtubeScopes() {
  const scopes: string[] = [...YOUTUBE_SCOPES];
  if (envTruthy("YOUTUBE_ANALYTICS_SCOPE")) scopes.push(YOUTUBE_ANALYTICS_SCOPE);
  return scopes;
}
