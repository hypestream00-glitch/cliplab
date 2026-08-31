/**
 * Composite viral score weights. Values must sum to 1.
 *
 * viralScore =
 *   hook * 0.28
 * + retention * 0.24
 * + emotion * 0.18
 * + clarity * 0.15
 * + shareability * 0.15
 */
export const CLIP_SCORE_WEIGHTS = {
  hook: 0.28,
  retention: 0.24,
  emotion: 0.18,
  clarity: 0.15,
  shareability: 0.15,
} as const;

export const CLIP_OVERLAP_THRESHOLD = 0.45;

/** Product clip window in seconds. Analyzer may pick any interval inside this range. */
export const CLIP_DURATION_MIN_SEC = 15;
export const CLIP_DURATION_MAX_SEC = 90;

export const TRANSCRIPT_CHUNK_MS = 10 * 60_000;
export const TRANSCRIPT_CHUNK_OVERLAP_MS = 2_000;
export const WHISPER_MAX_BYTES = 24 * 1024 * 1024;

export function clampClipDurationRange(minSec: number, maxSec: number, videoDurationSec: number) {
  const video = Math.max(1, Math.floor(videoDurationSec));
  const min = Math.max(1, Math.min(CLIP_DURATION_MIN_SEC, video));
  const max = Math.max(min, Math.min(CLIP_DURATION_MAX_SEC, video));
  const requestedMin = Number.isFinite(minSec) ? minSec : CLIP_DURATION_MIN_SEC;
  const requestedMax = Number.isFinite(maxSec) ? maxSec : CLIP_DURATION_MAX_SEC;
  const lo = Math.min(max, Math.max(min, Math.round(requestedMin)));
  const hi = Math.min(max, Math.max(lo, Math.round(requestedMax)));
  return { minSec: lo, maxSec: hi };
}

export function compositeViralScore(scores: {
  hookScore: number;
  retentionScore: number;
  emotionScore: number;
  clarityScore: number;
  shareabilityScore: number;
}) {
  const weighted =
    scores.hookScore * CLIP_SCORE_WEIGHTS.hook +
    scores.retentionScore * CLIP_SCORE_WEIGHTS.retention +
    scores.emotionScore * CLIP_SCORE_WEIGHTS.emotion +
    scores.clarityScore * CLIP_SCORE_WEIGHTS.clarity +
    scores.shareabilityScore * CLIP_SCORE_WEIGHTS.shareability;
  return Math.max(0, Math.min(100, Math.round(weighted)));
}
