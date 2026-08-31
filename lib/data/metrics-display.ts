import { snapshotMetricAvailable } from "@/lib/data/classify";

type SnapshotLike = {
  views: number;
  likes: number;
  comments: number;
  shares: number;
  followers?: number;
  rawPayload?: unknown;
};

export function realSnapshotMetric(
  snapshot: SnapshotLike | null | undefined,
  key: "views" | "likes" | "comments" | "shares" | "followers",
): number | null {
  if (!snapshot) return null;
  if (!snapshotMetricAvailable(snapshot.rawPayload, key)) return null;
  const value = snapshot[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function formatMetricOrEmpty(value: number | null, formatted: string) {
  return value == null ? "—" : formatted;
}
