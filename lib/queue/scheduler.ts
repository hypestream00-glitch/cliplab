import { logger } from "@/lib/logger";
import { processEmailOutbox } from "@/lib/email/outbox";
import { recoverPersistedJobs } from "@/lib/services/job-recovery";
import { beatWorker } from "@/lib/queue/heartbeat";
import { cleanupExpiredUploads } from "@/lib/uploads/session";
import { socialPublishAllowed } from "@/lib/env/status";
import { WORKER_SCHEDULER_INTERVAL_MS } from "@/lib/queue/consumers";

let timer: ReturnType<typeof setInterval> | null = null;
let lastAnalyticsAt = 0;
const ANALYTICS_EVERY_MS = 15 * 60_000;

export function workerSchedulerActive() {
  return timer != null;
}

export function startWorkerScheduler() {
  if (timer) return;
  void runWorkerSchedulerTick().catch((error) => {
    logger.warn({ errType: error instanceof Error ? error.name : "Error" }, "worker scheduler tick failed");
  });
  timer = setInterval(() => {
    void runWorkerSchedulerTick().catch((error) => {
      logger.warn({ errType: error instanceof Error ? error.name : "Error" }, "worker scheduler tick failed");
    });
  }, WORKER_SCHEDULER_INTERVAL_MS);
}

export function stopWorkerScheduler() {
  if (!timer) return;
  clearInterval(timer);
  timer = null;
}

export async function runWorkerSchedulerTick() {
  await beatWorker();
  await processEmailOutbox().catch((error) => {
    logger.warn({ errType: error instanceof Error ? error.name : "Error" }, "EMAIL SMTP ERROR: Timeout");
  });
  await recoverPersistedJobs().catch((error) => logger.warn({ err: error }, "job recovery skipped"));
  await cleanupExpiredUploads().catch(() => undefined);
  await maybeSyncAnalyticsInProcess();
  if (socialPublishAllowed()) {
    const { enqueueDueScheduledPublications } = await import("@/lib/services/publishing");
    await enqueueDueScheduledPublications().catch(() => undefined);
  }
}

async function maybeSyncAnalyticsInProcess() {
  if (Date.now() - lastAnalyticsAt < ANALYTICS_EVERY_MS) return;
  lastAnalyticsAt = Date.now();
  try {
    const { prisma } = await import("@/lib/db/prisma");
    const due = await prisma.socialAccount.count({
      where: {
        platform: { in: ["TIKTOK", "INSTAGRAM", "FACEBOOK", "X", "YOUTUBE"] },
        mock: false,
        OR: [{ lastSyncAt: null }, { lastSyncAt: { lt: new Date(Date.now() - ANALYTICS_EVERY_MS) } }],
      },
    });
    if (due > 0) {
      const { isUploadPostPrimary } = await import("@/lib/social/router");
      if (isUploadPostPrimary()) {
        const { syncDueUploadPostAnalytics } = await import("@/lib/social/upload-post/analytics");
        await syncDueUploadPostAnalytics();
      } else {
        const { syncDueTikTokAnalytics } = await import("@/lib/services/tiktok-analytics");
        const { syncDueMetaAnalytics } = await import("@/lib/services/meta-analytics");
        const { syncDueXAnalytics } = await import("@/lib/services/x-analytics");
        const { syncDueYouTubeAnalytics } = await import("@/lib/services/youtube-analytics");
        await syncDueTikTokAnalytics();
        await syncDueMetaAnalytics();
        await syncDueXAnalytics();
        await syncDueYouTubeAnalytics();
      }
    }
    const { syncCompetitionSubmissionMetrics } = await import("@/lib/competitions/sync");
    const { refreshCompetitionStatuses } = await import("@/lib/competitions/admin");
    const { persistTrendScores } = await import("@/lib/trending/query");
    const { refreshTrendingCatalog } = await import("@/lib/trending/refresh");
    await refreshCompetitionStatuses();
    await syncCompetitionSubmissionMetrics();
    await refreshTrendingCatalog().catch(() => undefined);
    await persistTrendScores().catch(() => undefined);
  } catch (error) {
    logger.warn({ errType: error instanceof Error ? error.name : "Error" }, "in-process analytics sync skipped");
  }
}
