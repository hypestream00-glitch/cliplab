import { createWorker, type JobPayload } from "@/lib/queue";
import { ensureSharedRedis } from "@/lib/queue/redis";
import { logger } from "@/lib/logger";

const ATTEMPT_PREFIX = "cliplab:infra-probe:attempts:";
const RESULT_PREFIX = "cliplab:infra-probe:result:";

export async function processInfraProbe(payload: JobPayload) {
  const redis = await ensureSharedRedis();
  if (!redis) throw new Error("Redis unavailable for infra probe");
  const attemptKey = `${ATTEMPT_PREFIX}${payload.entityId}`;
  const attempts = await redis.incr(attemptKey);
  await redis.expire(attemptKey, 120);
  if (attempts === 1) {
    throw new Error("infra-probe intentional first failure");
  }
  await redis.set(`${RESULT_PREFIX}${payload.entityId}`, "completed", "EX", 120);
  logger.info({ entityId: payload.entityId, attempts }, "infra probe completed");
}

export function createInfraProbeWorker() {
  return createWorker("infra-probe", processInfraProbe);
}
