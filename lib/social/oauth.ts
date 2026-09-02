import { createHash, randomBytes } from "node:crypto";
import type { SocialPlatform } from "@/generated/prisma/client";
import { oauthCallbackUrl } from "@/lib/env/app-url";
import { isYouTubeConfigured } from "@/lib/social/youtube/config";
import { isXConfigured } from "@/lib/social/x/config";

const PLATFORMS: SocialPlatform[] = [
  "TIKTOK",
  "INSTAGRAM",
  "FACEBOOK",
  "X",
  "LINKEDIN",
  "BLUESKY",
  "YOUTUBE",
  "THREADS",
  "PINTEREST",
  "TWITCH",
  "KICK",
  "REDDIT",
  "BILIBILI",
];

export function isSocialPlatform(value: string): value is SocialPlatform {
  return PLATFORMS.includes(value as SocialPlatform);
}

export function createOAuthState() {
  return randomBytes(24).toString("base64url");
}

export function createPkcePair() {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

export function oauthRedirectUri(platform?: SocialPlatform) {
  if (platform === "TIKTOK") return oauthCallbackUrl("TIKTOK");
  if (platform === "INSTAGRAM" || platform === "FACEBOOK") return oauthCallbackUrl("INSTAGRAM");
  if (platform === "X") return oauthCallbackUrl("X");
  if (platform === "YOUTUBE") return oauthCallbackUrl("YOUTUBE");
  return oauthCallbackUrl();
}

export function platformNeedsConfig(platform: SocialPlatform) {
  if (platform === "TIKTOK") {
    const key = process.env.TIKTOK_CLIENT_KEY ?? process.env.TIKTOK_CLIENT_ID;
    return !key?.trim() || !process.env.TIKTOK_CLIENT_SECRET?.trim();
  }
  if (platform === "X") return !isXConfigured();
  if (platform === "YOUTUBE") return !isYouTubeConfigured();
  if (platform === "TWITCH") return !(process.env.TWITCH_CLIENT_ID?.trim() && process.env.TWITCH_CLIENT_SECRET?.trim());
  if (platform === "KICK") return !(process.env.KICK_CLIENT_ID?.trim() && process.env.KICK_CLIENT_SECRET?.trim());
  if (platform === "BILIBILI") return !(process.env.BILIBILI_CLIENT_ID?.trim() && process.env.BILIBILI_CLIENT_SECRET?.trim());
  const keys: Record<Exclude<SocialPlatform, "TIKTOK" | "X" | "YOUTUBE" | "TWITCH" | "KICK" | "BILIBILI">, [string, string]> = {
    INSTAGRAM: ["META_APP_ID", "META_APP_SECRET"],
    FACEBOOK: ["META_APP_ID", "META_APP_SECRET"],
    LINKEDIN: ["LINKEDIN_CLIENT_ID", "LINKEDIN_CLIENT_SECRET"],
    BLUESKY: ["BLUESKY_CLIENT_ID", "BLUESKY_CLIENT_SECRET"],
    THREADS: ["META_APP_ID", "META_APP_SECRET"],
    PINTEREST: ["PINTEREST_CLIENT_ID", "PINTEREST_CLIENT_SECRET"],
    REDDIT: ["REDDIT_CLIENT_ID", "REDDIT_CLIENT_SECRET"],
  };
  const [id, secret] = keys[platform];
  return !process.env[id] || !process.env[secret];
}

export function usesDevelopmentOAuth(platform: SocialPlatform) {
  if (usesOfficialOAuth(platform)) return false;
  return process.env.DEV_MOCK_PROVIDERS !== "false" || platformNeedsConfig(platform);
}

export function usesOfficialOAuth(platform: SocialPlatform) {
  return (
    platform === "TIKTOK" ||
    platform === "INSTAGRAM" ||
    platform === "FACEBOOK" ||
    platform === "X" ||
    platform === "YOUTUBE" ||
    platform === "TWITCH" ||
    platform === "KICK" ||
    platform === "BILIBILI"
  );
}
