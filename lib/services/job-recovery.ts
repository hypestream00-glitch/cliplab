import { prisma } from "@/lib/db/prisma";
import { enqueue, getQueue, jobIdentityKey, type QueueName, type JobPayload } from "@/lib/queue";
import { logger } from "@/lib/logger";
import { enqueueDueScheduledPublications } from "@/lib/services/publishing";
import { workerRuntimeStatus } from "@/lib/queue/heartbeat";
import { STALE_ACTIVE_MS, toDbJobStatus } from "@/lib/jobs/status";
import { shouldRecoverPersistedJob } from "@/lib/jobs/recovery-policy";

function mapJobType(type: string): QueueName | null {
  if (type === "VIDEO_IMPORT" || type === "VIDEO_PROCESSING") return "video-import";
  if (type === "RENDER") return "render";
  if (type === "SOCIAL_PUBLISHING") return "social-publishing";
  if (type === "BULK_DOWNLOAD") return "bulk-download";
  if (type === "ANALYTICS_SYNC") return "analytics-sync";
  return null;
}

async function bullJobIsLive(queueName: QueueName, payload: JobPayload): Promise<boolean> {
  const queue = getQueue(queueName);
  if (!queue) return false;
  try {
    const job = await queue.getJob(jobIdentityKey(queueName, payload));
    if (!job) return false;
    const state = await job.getState();
    return state === "active" || state === "waiting" || state === "delayed" || state === "waiting-children";
  } catch {
    return false;
  }
}

export async function recoverPersistedJobs() {
  const worker = await workerRuntimeStatus();
  const stale = await prisma.processingJob.findMany({
    where: {
      OR: [
        { status: { in: ["WAITING", "DELAYED"] }, createdAt: { lt: new Date(Date.now() - 15_000) } },
        { status: "ACTIVE", startedAt: { lt: new Date(Date.now() - STALE_ACTIVE_MS) } },
      ],
    },
    take: 25,
    orderBy: { createdAt: "asc" },
  });
  let recovered = 0;
  for (const job of stale) {
    const queue = mapJobType(job.type);
    if (!queue || !job.entityId) continue;
    const payload: JobPayload = {
      jobId: job.id,
      workspaceId: job.workspaceId,
      entityId: job.entityId,
      type: queue,
    };
    const live = job.status === "ACTIVE" ? await bullJobIsLive(queue, payload) : false;
    if (
      !shouldRecoverPersistedJob({
        status: job.status,
        createdAt: job.createdAt,
        startedAt: job.startedAt,
        workerStatus: worker,
        bullJobLive: live,
      })
    ) {
      continue;
    }
    try {
      if (job.status === "ACTIVE") {
        await prisma.processingJob.update({
          where: { id: job.id },
          data: { status: toDbJobStatus("QUEUED"), message: "Recuperado após interrupção" },
        });
      }
      await enqueue(queue, payload);
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
