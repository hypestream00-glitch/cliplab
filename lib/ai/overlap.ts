import { CLIP_OVERLAP_THRESHOLD } from "@/lib/config/clip-score";

export type OverlapCandidate = {
  startMs: number;
  endMs: number;
  score: number;
};

export function overlapRatio(a: OverlapCandidate, b: OverlapCandidate) {
  const start = Math.max(a.startMs, b.startMs);
  const end = Math.min(a.endMs, b.endMs);
  const intersection = Math.max(0, end - start);
  if (!intersection) return 0;
  const union = Math.max(a.endMs, b.endMs) - Math.min(a.startMs, b.startMs);
  return union > 0 ? intersection / union : 0;
}

export function removeOverlappingCandidates<T extends OverlapCandidate>(
  candidates: T[],
  threshold = CLIP_OVERLAP_THRESHOLD,
): T[] {
  const sorted = [...candidates].sort((a, b) => b.score - a.score || a.startMs - b.startMs);
  const kept: T[] = [];
  for (const item of sorted) {
    const clashes = kept.some((existing) => overlapRatio(item, existing) >= threshold);
    if (!clashes) kept.push(item);
  }
  return kept.sort((a, b) => a.startMs - b.startMs);
}
