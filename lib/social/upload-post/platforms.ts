import type { SocialPlatform } from "@/generated/prisma/client";

/** Official `platform[]` values for POST /api/upload (video). */
export const UPLOAD_POST_VIDEO_PLATFORMS = [
  "tiktok",
  "instagram",
  "linkedin",
  "youtube",
  "facebook",
  "twitter",
  "threads",
  "pinterest",
  "bluesky",
  "reddit",
] as const;

export type UploadPostPlatform = (typeof UPLOAD_POST_VIDEO_PLATFORMS)[number];

const TO_API: Partial<Record<SocialPlatform, UploadPostPlatform>> = {
  TIKTOK: "tiktok",
  INSTAGRAM: "instagram",
  FACEBOOK: "facebook",
  X: "twitter",
  YOUTUBE: "youtube",
  LINKEDIN: "linkedin",
  THREADS: "threads",
  PINTEREST: "pinterest",
  BLUESKY: "bluesky",
  REDDIT: "reddit",
};

const FROM_API: Record<string, SocialPlatform> = {
  tiktok: "TIKTOK",
  instagram: "INSTAGRAM",
  facebook: "FACEBOOK",
  twitter: "X",
  x: "X",
  youtube: "YOUTUBE",
  linkedin: "LINKEDIN",
  threads: "THREADS",
  pinterest: "PINTEREST",
  bluesky: "BLUESKY",
  reddit: "REDDIT",
};

export function toUploadPostPlatform(platform: SocialPlatform): UploadPostPlatform | null {
  return TO_API[platform] ?? null;
}

export function fromUploadPostPlatform(value: string): SocialPlatform | null {
  return FROM_API[value.toLowerCase()] ?? null;
}

export function connectPlatforms(): string[] {
  return ["tiktok", "instagram", "facebook", "x", "youtube", "linkedin", "threads", "pinterest", "reddit"];
}

/** Platforms supported by Upload-Post video upload + JWT/Connect API (docs atuais). */
export function getSupportedPlatforms(): SocialPlatform[] {
  return ["TIKTOK", "INSTAGRAM", "FACEBOOK", "X", "YOUTUBE", "LINKEDIN", "THREADS", "PINTEREST", "BLUESKY", "REDDIT"];
}

export const ANALYTICS_PLATFORMS = [
  "tiktok",
  "instagram",
  "facebook",
  "x",
  "youtube",
  "linkedin",
  "threads",
  "pinterest",
  "reddit",
  "bluesky",
] as const;
