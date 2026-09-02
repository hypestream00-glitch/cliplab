export type TrendingInputs = {
  viewCount?: number | null;
  views24h?: number | null;
  views7d?: number | null;
  engagement?: number | null;
  publishedAt?: Date | null;
  derivedClipCount?: number | null;
  kind?: "content" | "live" | string | null;
};

export type TrendScoreResult = {
  score: number | null;
  inputs: Record<string, number>;
  reason?: string;
};

function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function recencyScore(publishedAt: Date, now: Date) {
  const ageHours = (now.getTime() - publishedAt.getTime()) / 3_600_000;
  if (ageHours <= 0) return 100;
  if (ageHours <= 24) return 95;
  if (ageHours <= 72) return 80;
  if (ageHours <= 168) return 60;
  if (ageHours <= 720) return 35;
  return 10;
}

export function computeTrendScore(input: TrendingInputs, now = new Date()): TrendScoreResult {
  const parts: Record<string, number> = {};
  const live = input.kind === "live";
  if (typeof input.viewCount === "number" && Number.isFinite(input.viewCount) && input.viewCount >= 0) {
    parts[live ? "currentViewers" : "views"] = clamp(Math.log10(input.viewCount + 1) * (live ? 22 : 20));
  }
  if (typeof input.views24h === "number" && Number.isFinite(input.views24h) && input.views24h >= 0) {
    parts.velocity24h = clamp(Math.log10(input.views24h + 1) * 28);
  }
  if (typeof input.views7d === "number" && Number.isFinite(input.views7d) && input.views7d >= 0) {
    parts.velocity7d = clamp(Math.log10(input.views7d + 1) * 22);
  }
  if (!live && typeof input.engagement === "number" && Number.isFinite(input.engagement) && input.engagement >= 0) {
    parts.engagement = clamp(input.engagement);
  }
  if (input.publishedAt instanceof Date && !Number.isNaN(input.publishedAt.getTime())) {
    parts[live ? "duration" : "recency"] = recencyScore(input.publishedAt, now);
  }
  if (typeof input.derivedClipCount === "number" && input.derivedClipCount >= 0) {
    parts.derivedClips = clamp(input.derivedClipCount * 8);
  }
  const keys = Object.keys(parts);
  if (keys.length === 0) return { score: null, inputs: {}, reason: "no-data" };
  const score = clamp(keys.reduce((sum, key) => sum + parts[key], 0) / keys.length);
  return { score, inputs: parts };
}
