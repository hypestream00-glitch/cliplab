import { createProjectPipelineWorker } from "@/workers/video-processing";
import { createRenderWorker } from "@/workers/render";
import { createPublishWorker } from "@/workers/social-publishing";
import { createBulkDownloadWorker } from "@/workers/bulk-download";
import { createAnalyticsWorker } from "@/workers/analytics";
import { createInfraProbeWorker } from "@/workers/infra-probe";
import { recoverPersistedJobs } from "@/lib/services/job-recovery";
import { enqueueDueScheduledPublications } from "@/lib/services/publishing";
import { shouldEmbedWorkers } from "@/lib/queue/runtime";
import { isNextBuildPhase } from "@/lib/env/build-phase";
import { beatWorker } from "@/lib/queue/heartbeat";
import { processEmailOutbox } from "@/lib/email/outbox";
import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/logger";
import { cleanupExpiredUploads } from "@/lib/uploads/session";

let started = false;
let scheduleTimer: ReturnType<typeof setInterval> | null = null;

export function startClipLabWorkers() {
  if (started) return;
  started = true;
  createProjectPipelineWorker();
  createRenderWorker();
  createPublishWorker();
  createBulkDownloadWorker();
  createAnalyticsWorker();
  createInfraProbeWorker();
  void recoverPersistedJobs().catch((error) => logger.warn({ err: error }, "initial job recovery failed"));
  void beatWorker().catch(() => undefined);
  if (!scheduleTimer) {
    scheduleTimer = setInterval(() => {
      void beatWorker().catch(() => undefined);
      void processEmailOutbox().catch(() => undefined);
      void enqueueDueScheduledPublications().catch(() => undefined);
      void recoverPersistedJobs().catch(() => undefined);
      void cleanupExpiredUploads().catch(() => undefined);
      void (async () => {
        const due = await prisma.socialAccount.count({
          where: {
            platform: { in: ["TIKTOK", "INSTAGRAM", "FACEBOOK", "X", "YOUTUBE"] },
            mock: false,
            OR: [{ lastSyncAt: null }, { lastSyncAt: { lt: new Date(Date.now() - 15 * 60 * 1000) } }],
          },
        });
        if (due > 0) {
          const { enqueue } = await import("@/lib/queue");
          await enqueue("analytics-sync", {
            jobId: `analytics-${Date.now()}`,
            workspaceId: "system",
            entityId: "social",
            type: "analytics-sync",
          });
        }
      })().catch(() => undefined);
    }, 60_000);
  }
  logger.info({ embedded: shouldEmbedWorkers() }, "CLIPLAB workers registered");
}

export function stopClipLabWorkers() {
  if (scheduleTimer) {
    clearInterval(scheduleTimer);
    scheduleTimer = null;
  }
  started = false;
}

export function ensureDevWorkers() {
  if (isNextBuildPhase()) return;
  if (!shouldEmbedWorkers()) return;
  startClipLabWorkers();
}
