import { isUploadPostPrimary } from "@/lib/social/router";

const CALLBACK_PATH = "/api/social/oauth/callback";

export function publicBaseUrl() {
  const explicit = (process.env.APP_URL ?? process.env.MEDIA_BASE_URL ?? process.env.AUTH_URL ?? "").trim().replace(/\/$/, "");
  if (explicit) return explicit;
  return "http://localhost:3000";
}

export function oauthCallbackUrl(platform?: "TIKTOK" | "INSTAGRAM" | "FACEBOOK" | "X" | "YOUTUBE") {
  if (platform === "TIKTOK" && process.env.TIKTOK_REDIRECT_URI?.trim()) return process.env.TIKTOK_REDIRECT_URI.trim();
  if ((platform === "INSTAGRAM" || platform === "FACEBOOK") && process.env.META_REDIRECT_URI?.trim()) {
    return process.env.META_REDIRECT_URI.trim();
  }
  if (platform === "X" && process.env.X_REDIRECT_URI?.trim()) return process.env.X_REDIRECT_URI.trim();
  if (platform === "YOUTUBE") {
    const explicit = process.env.GOOGLE_REDIRECT_URI?.trim() || process.env.YOUTUBE_REDIRECT_URI?.trim();
    if (explicit) return explicit;
  }
  return `${publicBaseUrl()}${CALLBACK_PATH}`;
}

export function oauthCallbackCatalog() {
  if (isUploadPostPrimary()) {
    return [{ id: "upload-post", label: "Upload-Post webhook", url: `${publicBaseUrl()}/api/webhooks/upload-post` }] as const;
  }
  return [
    { id: "tiktok", label: "TikTok callback", url: oauthCallbackUrl("TIKTOK") },
    { id: "meta", label: "Meta callback", url: oauthCallbackUrl("INSTAGRAM") },
    { id: "x", label: "X callback", url: oauthCallbackUrl("X") },
    { id: "google", label: "Google / YouTube callback", url: oauthCallbackUrl("YOUTUBE") },
    { id: "generic", label: "Twitch / Kick / Bilibili callback", url: oauthCallbackUrl() },
  ] as const;
}

export function isLocalhostHost(hostname: string) {
  const host = hostname.toLowerCase();
  return host === "localhost" || host === "127.0.0.1" || host === "::1" || host.endsWith(".local");
}

export function isPublicHttpsUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !isLocalhostHost(url.hostname);
  } catch {
    return false;
  }
}

export function mediaUrlIsSafeForExternalApis(value: string) {
  if (!value) return false;
  if (value.startsWith("file:")) return false;
  return isPublicHttpsUrl(value);
}

export function productionRequiresHttps() {
  return process.env.NODE_ENV === "production";
}
