import { xCaptionLimit } from "@/lib/social/platform-limits";

export function mapXMediaStatus(state?: string): "UPLOADING" | "PROCESSING" | "PUBLISHED" | "FAILED" {
  if (state === "pending" || state === "in_progress") return "PROCESSING";
  if (state === "succeeded") return "PUBLISHED";
  if (state === "failed") return "FAILED";
  return "PROCESSING";
}

export function composeXCaption(caption: string, hashtags: string[], maxChars: number) {
  const tags = hashtags
    .map((tag) => tag.replace(/^#/, "").trim())
    .filter(Boolean)
    .slice(0, 30)
    .map((tag) => `#${tag}`)
    .join(" ");
  return `${caption.trim()} ${tags}`.trim().slice(0, maxChars);
}

export function xPublishLockKey(targetId: string, clipId: string, accountId: string) {
  return `x:${targetId}:${clipId}:${accountId}`;
}

export function xCaptionMaxChars() {
  return xCaptionLimit();
}
