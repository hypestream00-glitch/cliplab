export const METRICS_SOURCES = ["OFFICIAL_API", "AUTHORIZED_PROVIDER", "MANUAL_UNVERIFIED"] as const;
export type MetricsSource = (typeof METRICS_SOURCES)[number];

const OFFICIAL = new Set(["youtube", "tiktok", "instagram", "facebook", "kick", "twitch", "bilibili", "OFFICIAL_API"]);
const AUTHORIZED = new Set(["upload-post", "AUTHORIZED_PROVIDER"]);

export function classifyMetricsSource(source: string): MetricsSource {
  if (OFFICIAL.has(source) || source.endsWith("-api")) return "OFFICIAL_API";
  if (AUTHORIZED.has(source)) return "AUTHORIZED_PROVIDER";
  return "MANUAL_UNVERIFIED";
}

export function metricsEligibleForOfficialPayout(source: string) {
  const kind = classifyMetricsSource(source);
  return kind === "OFFICIAL_API" || kind === "AUTHORIZED_PROVIDER";
}
