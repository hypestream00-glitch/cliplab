import type { CompetitionSubmissionStatus } from "@/generated/prisma/client";

export type RankedRow = {
  participantId: string;
  userId: string;
  displayName: string;
  avatarUrl?: string | null;
  validViews: number;
  validClips: number;
  estimatedPrizeCents: number;
};

export function rankParticipants(rows: Array<Omit<RankedRow, "estimatedPrizeCents"> & { estimatedPrizeCents?: number }>) {
  return [...rows]
    .sort((a, b) => b.validViews - a.validViews || b.validClips - a.validClips)
    .map((row, index) => ({
      ...row,
      position: index + 1,
      estimatedPrizeCents: row.estimatedPrizeCents ?? 0,
    }));
}

export function detectMetricAnomaly(params: {
  previousViews: number | null;
  nextViews: number | null;
}) {
  if (params.nextViews == null || params.previousViews == null) return null;
  if (params.nextViews < params.previousViews) return "views-decreased";
  if (params.previousViews > 0 && params.nextViews > params.previousViews * 20) return "views-spike";
  return null;
}

export function nextSubmissionStatusFromMetrics(params: {
  current: string;
  owned: boolean;
  notSupported?: boolean;
  transient?: boolean;
  viewsAvailable: boolean;
  views: number | null;
  previousViews: number | null;
}): { status: CompetitionSubmissionStatus; flagReason: string | null; metricsAvailable: boolean } {
  if (params.transient) {
    return { status: params.current as CompetitionSubmissionStatus, flagReason: null, metricsAvailable: false };
  }
  if (params.notSupported) {
    return {
      status: params.current === "VERIFIED" ? "VERIFIED" : "PENDING",
      flagReason: null,
      metricsAvailable: false,
    };
  }
  if (!params.owned) {
    return { status: "REJECTED", flagReason: null, metricsAvailable: false };
  }
  if (params.viewsAvailable && params.views != null) {
    const anomaly = detectMetricAnomaly({ previousViews: params.previousViews, nextViews: params.views });
    return {
      status: anomaly ? "FLAGGED" : "VERIFIED",
      flagReason: anomaly,
      metricsAvailable: true,
    };
  }
  return {
    status: params.current === "VERIFIED" ? "VERIFIED" : "PENDING",
    flagReason: null,
    metricsAvailable: false,
  };
}
