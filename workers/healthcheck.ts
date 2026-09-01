import { createWorker, type JobPayload } from "@/lib/queue";
import { logger } from "@/lib/logger";

export const HEALTHCHECK_QUEUE = "healthcheck" as const;
export const HEALTHCHECK_JOB = "cliplab-healthcheck";
export const HEALTHCHECK_RESULT_PREFIX = "cliplab:healthcheck:result:";

export async function processHealthcheck(
  payload: JobPayload,
  deps?: {
    pingDatabase?: () => Promise<void>;
    markComplete?: (jobId: string) => Promise<void>;
  },
) {
  if (deps?.pingDatabase) {
    await deps.pingDatabase();
  } else {
    const { prisma } = await import("@/lib/db/prisma");
    await prisma.$queryRaw`SELECT 1`;
  }

  if (deps?.markComplete) {
    await deps.markComplete(payload.jobId);
  } else {
    const { getSharedRedis, isRedisConfigured } = await import("@/lib/queue/redis");
    if (isRedisConfigured()) {
      await getSharedRedis()?.set(`${HEALTHCHECK_RESULT_PREFIX}${payload.jobId}`, "completed", "EX", 300);
    }
  }

  logger.info({ jobId: payload.jobId }, "cliplab-healthcheck completed");
}

export function createHealthcheckWorker() {
  return createWorker(HEALTHCHECK_QUEUE, (payload) => processHealthcheck(payload));
}
