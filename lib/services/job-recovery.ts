import { prisma } from "@/lib/db/prisma";
import { enqueue, type QueueName } from "@/lib/queue";
import { logger } from "@/lib/logger";
import { enqueueDueScheduledPublications } from "@/lib/services/publishing";
import { workerRuntimeStatus } from "@/lib/queue/heartbeat";
import { STALE_ACTIVE_MS, toDbJobStatus } from "@/lib/jobs/status";

function mapJobType(type: string): QueueName | null {
  if (type === "VIDEO_IMPORT" || type === "VIDEO_PROCESSING") return "video-import";
  if (type === "RENDER") return "render";
  if (type === "SOCIAL_PUBLISHING") return "social-publishing";
  if (type === "BULK_DOWNLOAD") return "bulk-download";
  if (type === "ANALYTICS_SYNC") return "analytics-sync";
  return null;
}

export async function recoverPersistedJobs() {
  const worker = await workerRuntimeStatus();
  const stale = await prisma.processingJob.findMany({
    where: {
      OR: [
        { status: { in: ["WAITING", "DELAYED"] }, createdAt: { lt: new Date(Date.now() - 15_000) } },
        worker === "NOT RUNNING"
          ? {
              status: "ACTIVE",
              startedAt: { lt: new Date(Date.now() - STALE_ACTIVE_MS) },
            }
          : { id: "__never__" },
      ],
    },
    take: 25,
    orderBy: { createdAt: "asc" },
  });
  let recovered = 0;
  for (const job of stale) {
    const queue = mapJobType(job.type);
    if (!queue || !job.entityId) continue;
    try {
      if (job.status === "ACTIVE") {
        await prisma.processingJob.update({
          where: { id: job.id },
          data: { status: toDbJobStatus("QUEUED"), message: "Recuperado após interrupção" },
        });
      }
      await enqueue(queue, {
        jobId: job.id,
        workspaceId: job.workspaceId,
        entityId: job.entityId,
        type: queue,
      });
      recovered += 1;
    } catch (error) {
      logger.warn({ err: error, jobId: job.id }, "job recovery skipped");
    }
  }

  const waitingRenders = await prisma.renderJob.findMany({
    where: { status: "WAITING", createdAt: { lt: new Date(Date.now() - 15_000) } },
    take: 10,
  });
  for (const job of waitingRenders) {
    try {
      await enqueue("render", {
        jobId: job.id,
        workspaceId: job.workspaceId,
        entityId: job.id,
        type: "render",
      });
      recovered += 1;
    } catch (error) {
      logger.warn({ err: error, renderJobId: job.id }, "render recovery skipped");
    }
  }

  try {
    recovered += await enqueueDueScheduledPublications();
  } catch (error) {
    logger.warn({ err: error }, "scheduled publication recovery skipped");
  }

  logger.info({ recovered }, "job recovery sweep");
  return recovered;
}
