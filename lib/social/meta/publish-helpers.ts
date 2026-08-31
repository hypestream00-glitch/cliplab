import { PLATFORM_LIMITS } from "@/lib/social/platform-limits";
import { MetaApiError } from "@/lib/social/meta/http";

export function composeMetaCaption(caption: string, hashtags: string[], platform: "INSTAGRAM" | "FACEBOOK") {
  const limits = PLATFORM_LIMITS[platform];
  const tags = hashtags
    .map((tag) => tag.replace(/^#/, "").trim())
    .filter(Boolean)
    .slice(0, limits.maxHashtags)
    .map((tag) => `#${tag}`)
    .join(" ");
  return `${caption.trim()} ${tags}`.trim().slice(0, limits.captionMaxChars);
}

export function metaPublishLockKey(
  platform: "instagram" | "facebook",
  targetId: string,
  clipId: string,
  accountId: string,
) {
  return `${platform}:${targetId}:${clipId}:${accountId}`;
}

export function validateInstagramReel(probe: { durationMs: number; width: number | null; fps: number | null; size: number }) {
  const limits = PLATFORM_LIMITS.INSTAGRAM;
  if (probe.size <= 0) throw new MetaApiError("Arquivo de vídeo vazio.", "invalid_video", 400, false);
  if (probe.size > limits.maxFileBytes) throw new MetaApiError("Instagram Reels aceita no máximo 300 MB.", "invalid_video", 400, false);
  const sec = probe.durationMs / 1000;
  if (sec < limits.minDurationSec) throw new MetaApiError("Reels no Instagram precisa ter pelo menos 3 segundos.", "invalid_video", 400, false);
  if (sec > limits.maxDurationSec) throw new MetaApiError("Reels no Instagram aceita no máximo 15 minutos.", "invalid_video", 400, false);
  if (probe.fps && (probe.fps < limits.minFps || probe.fps > limits.maxFps)) {
    throw new MetaApiError("FPS do Instagram deve estar entre 23 e 60.", "invalid_video", 400, false);
  }
  if (probe.width && probe.width > limits.maxWidth) throw new MetaApiError("Largura máxima do Instagram Reels é 1920 px.", "invalid_video", 400, false);
}

export function validateFacebookReel(probe: {
  durationMs: number;
  width: number | null;
  height: number | null;
  fps: number | null;
  size: number;
}) {
  const limits = PLATFORM_LIMITS.FACEBOOK;
  if (probe.size <= 0) throw new MetaApiError("Arquivo de vídeo vazio.", "invalid_video", 400, false);
  if (probe.size > limits.maxFileBytes) throw new MetaApiError("Vídeo excede o limite do Facebook Reels.", "invalid_video", 400, false);
  const sec = probe.durationMs / 1000;
  if (sec < limits.minDurationSec) throw new MetaApiError("Reels no Facebook precisa ter pelo menos 3 segundos.", "invalid_video", 400, false);
  if (sec > limits.maxDurationSec) throw new MetaApiError("Reels no Facebook aceita no máximo 90 segundos.", "invalid_video", 400, false);
  if (probe.fps && (probe.fps < limits.minFps || probe.fps > limits.maxFps)) {
    throw new MetaApiError("FPS do Facebook Reels deve estar entre 24 e 60.", "invalid_video", 400, false);
  }
  if (probe.width && probe.width < limits.minWidth) throw new MetaApiError("Resolução mínima do Facebook Reels é 540×960.", "invalid_video", 400, false);
}
