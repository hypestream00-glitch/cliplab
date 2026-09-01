import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/logger";
import { fetchSubmissionMetrics } from "@/lib/competitions/metrics";
import { nextSubmissionStatusFromMetrics } from "@/lib/competitions/ranking";
import { writeCompetitionAudit } from "@/lib/competitions/audit";
import { notifyWorkspace } from "@/lib/services/notifications";

const DEFAULT_BATCH = 20;

export function competitionMetricsSyncMs() {
  const raw = Number(process.env.COMPETITION_METRICS_SYNC_MS ?? 15 * 60_000);
  return Number.isFinite(raw) && raw >= 60_000 ? Math.min(raw, 6 * 60 * 60_000) : 15 * 60_000;
}

export async function syncCompetitionSubmissionMetrics(limit = DEFAULT_BATCH) {
  const now = new Date();
  const due = await prisma.competitionSubmission.findMany({
    where: {
      status: { in: ["PENDING", "VERIFIED", "FLAGGED"] },
      competition: { status: { in: ["ACTIVE", "FINALIZING"] } },
      OR: [{ lastSyncedAt: null }, { lastSyncedAt: { lt: new Date(now.getTime() - competitionMetricsSyncMs()) } }],
    },
    include: { socialAccount: true, competition: true },
    take: limit,
    orderBy: { lastSyncedAt: "asc" },
  });

  for (const submission of due) {
    try {
      const metrics = await fetchSubmissionMetrics({
        account: submission.socialAccount,
        platform: submission.platform,
        postExternalId: submission.postExternalId,
        publicationId: submission.publicationId,
      });
      await prisma.competitionSubmissionMetric.create({
        data: {
          submissionId: submission.id,
          views: metrics.views,
          likes: metrics.likes,
          comments: metrics.comments,
          shares: metrics.shares,
          capturedAt: now,
          source: metrics.source,
          available: metrics.available,
        },
      });

      const previous = submission.latestViews;
      const next = nextSubmissionStatusFromMetrics({
        current: submission.status,
        owned: metrics.owned,
        notSupported: metrics.notSupported,
        transient: metrics.transient,
        viewsAvailable: metrics.available.views,
        views: metrics.views,
        previousViews: previous,
      });

      await prisma.competitionSubmission.update({
        where: { id: submission.id },
        data: {
          latestViews: metrics.transient ? submission.latestViews : metrics.views,
          latestLikes: metrics.transient ? submission.latestLikes : metrics.likes,
          latestComments: metrics.transient ? submission.latestComments : metrics.comments,
          latestShares: metrics.transient ? submission.latestShares : metrics.shares,
          metricsAvailable: next.metricsAvailable || (metrics.transient ? submission.metricsAvailable : false),
          lastSyncedAt: now,
          status: next.status,
          flagReason: next.flagReason ?? submission.flagReason,
          rejectReason:
            next.status === "REJECTED"
              ? metrics.error ?? "Essa publicação não pertence à conta conectada."
              : submission.rejectReason,
        },
      });

      if (next.status === "VERIFIED" && submission.status !== "VERIFIED") {
        await writeCompetitionAudit({
          competitionId: submission.competitionId,
          action: "SUBMISSION_VERIFIED",
          entityType: "CompetitionSubmission",
          entityId: submission.id,
        });
        await notifyWorkspace({
          workspaceId: submission.workspaceId,
          type: "COMPETITION",
          title: "Clip verificado no campeonato",
          body: "Sua publicação foi validada e entra no ranking com views oficiais.",
          entityType: "Competition",
          entityId: submission.competitionId,
        }).catch(() => undefined);
      }
      if (next.status === "REJECTED" && submission.status !== "REJECTED") {
        await writeCompetitionAudit({
          competitionId: submission.competitionId,
          action: "SUBMISSION_REJECTED",
          entityType: "CompetitionSubmission",
          entityId: submission.id,
          metadata: { reason: metrics.error },
        });
      }
    } catch (error) {
      logger.warn({ err: error, submissionId: submission.id }, "competition metric sync skipped");
      await writeCompetitionAudit({
        competitionId: submission.competitionId,
        action: "METRIC_SYNC_FAILED",
        entityType: "CompetitionSubmission",
        entityId: submission.id,
      }).catch(() => undefined);
    }
  }

  await prisma.competition.updateMany({
    where: { status: { in: ["ACTIVE", "FINALIZING"] } },
    data: { metricsSyncedAt: now },
  });
  return due.length;
}
