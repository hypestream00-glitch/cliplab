import { PLATFORM_LIMITS } from "@/lib/social/platform-limits";

const LIMITS = PLATFORM_LIMITS.TIKTOK;

export function composeTikTokTitle(caption: string, hashtags: string[]) {
  const tags = hashtags
    .map((tag) => tag.replace(/^#/, "").trim())
    .filter(Boolean)
    .slice(0, LIMITS.maxHashtags)
    .map((tag) => `#${tag}`)
    .join(" ");
  return `${caption.trim()} ${tags}`.trim().slice(0, LIMITS.captionMaxChars);
}
