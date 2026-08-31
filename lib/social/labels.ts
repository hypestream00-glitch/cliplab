import type { SocialPlatform } from "@/generated/prisma/client";

const LABELS: Record<SocialPlatform, string> = {
  TIKTOK: "TikTok",
  INSTAGRAM: "Instagram",
  FACEBOOK: "Facebook",
  X: "X",
  YOUTUBE: "YouTube",
  LINKEDIN: "LinkedIn",
  THREADS: "Threads",
  PINTEREST: "Pinterest",
  BLUESKY: "Bluesky",
  REDDIT: "Reddit",
  TWITCH: "Twitch",
  KICK: "Kick",
};

export function socialPlatformLabel(platform: SocialPlatform | string) {
  return LABELS[platform as SocialPlatform] ?? platform;
}
