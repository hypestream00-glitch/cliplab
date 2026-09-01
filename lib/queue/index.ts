import { Queue, Worker, type JobsOptions } from "bullmq";
import { logger } from "@/lib/logger";
import { workerConcurrency, bullmqConnection } from "@/lib/queue/redis";
import { beatWorker } from "@/lib/queue/heartbeat";
import { QUEUE_RETRY } from "@/lib/queue/retry";
import { queueMode } from "@/lib/queue/runtime";

export { QUEUE_RETRY } from "@/lib/queue/retry";
export { isProductionRuntime, queueMode, isQueueMocked, shouldEmbedWorkers } from "@/lib/queue/runtime";

export const QUEUE_NAMES = [
  "video-import",
  "video-processing",
  "transcription",
  "ai-analysis",
  "clip-generation",
  "render",
  "social-publishing",
  "analytics-sync",
  "live-monitor",
  "notifications",
  "bulk-download",
  "infra-probe",
  "healthcheck",
] as const;

export type QueueName = (typeof QUEUE_NAMES)[number];

const defaultJobOptions: JobsOptions = {
  attempts: QUEUE_RETRY.attempts,
  backoff: { type: QUEUE_RETRY.backoff.type, delay: QUEUE_RETRY.backoff.delay },
  removeOnComplete: 200,
  removeOnFail: 500,
};

export type JobPayload = {
  jobId: string;
  workspaceId: string;
  entityId: string;
  type: QueueName;
};

const memoryHandlers = new Map<QueueName, (payload: JobPayload) => Promise<void>>();
const memoryQueues: Record<string, JobPayload[]> = {};
const inFlight = new Set<string>();

export function registerQueueHandler(name: QueueName, handler: (payload: JobPayload) => Promise<void>) {
  memoryHandlers.set(name, handler);
  const pending = memoryQueues[name] ?? [];
  memoryQueues[name] = [];
  for (const payload of pending) {
    setTimeout(() => {
      void runProcessor(name, handler, payload);
    }, 250);
  }
}

function connection() {
  return bullmqConnection();
}

const queues = new Map<QueueName, Queue>();
const workers: Worker[] = [];

export function getQueue(name: QueueName) {
  const redis = connection();
  if (!redis) return null;
  const existing = queues.get(name);
  if (existing) return existing;
  const queue = new Queue(name, { connection: redis });
  queues.set(name, queue);
  return queue;
}

export class QueueUnavailableError extends Error {
  constructor(queue: QueueName) {
    super(`Fila ${queue} exige REDIS_URL em produção. Jobs não podem ficar só na memória do processo web.`);
    this.name = "QueueUnavailableError";
  }
}

export function jobIdentityKey(name: QueueName, payload: JobPayload) {
  return `${name}:${payload.entityId}:${payload.jobId}`;
}

function duplicateKey(name: QueueName, payload: JobPayload) {
  return jobIdentityKey(name, payload);
}

async function skipIfCompleted(payload: JobPayload) {
  try {
    const { prisma } = await import("@/lib/db/prisma");
    const row = await prisma.processingJob.findUnique({ where: { id: payload.jobId }, select: { status: true } });
    return row?.status === "COMPLETED";
  } catch {
    return false;
  }
}

async function runProcessor(name: QueueName, processor: (payload: JobPayload) => Promise<void>, payload: JobPayload) {
  const key = duplicateKey(name, payload);
  if (inFlight.has(key)) {
    logger.warn({ queue: name, jobId: payload.jobId }, "duplicate in-flight job skipped");
    return;
  }
  if (await skipIfCompleted(payload)) return;
  inFlight.add(key);
  try {
    await beatWorker();
    await processor(payload);
  } finally {
    inFlight.delete(key);
  }
}

export async function enqueue(name: QueueName, payload: JobPayload) {
  const mode = queueMode();
  const queue = getQueue(name);
  if (queue) {
    await queue.add(name, payload, {
      ...defaultJobOptions,
      jobId: duplicateKey(name, payload),
    });
    return { mocked: false as const, mode: "redis" as const };
  }

  if (mode === "unavailable") {
    throw new QueueUnavailableError(name);
  }

  logger.warn({ queue: name, entityId: payload.entityId }, "queue running in local fallback (no Redis)");
  memoryQueues[name] ??= [];
  memoryQueues[name].push(payload);
  const handler = memoryHandlers.get(name);
  if (handler) {
    setTimeout(() => {
      void runProcessor(name, handler, payload);
    }, 250);
  }
  return { mocked: true as const, mode: "local" as const };
}

export function createWorker(name: QueueName, processor: (payload: JobPayload) => Promise<void>) {
  registerQueueHandler(name, processor);
  const redis = connection();
  if (!redis) {
    logger.warn({ queue: name }, "BullMQ worker skipped (REDIS_URL missing)");
    return null;
  }
  const worker = new Worker(
    name,
    async (job) => {
      await runProcessor(name, processor, job.data as JobPayload);
    },
    {
      connection: redis,
      concurrency: workerConcurrency(name),
      lockDuration: 10 * 60_000,
      stalledInterval: 60_000,
    },
  );
  worker.on("error", (error) => {
    logger.warn({ err: error, queue: name }, "bullmq worker error");
  });
  worker.on("failed", (job, error) => {
    logger.warn({ err: error, queue: name, jobId: job?.id }, "bullmq job failed");
    const payload = job?.data as JobPayload | undefined;
    if (!payload?.jobId) return;
    if (name === "healthcheck" || name === "infra-probe") return;
    const attempts = job?.opts?.attempts ?? QUEUE_RETRY.attempts;
    if ((job?.attemptsMade ?? 0) < attempts) return;
    void markPersistedJobFailed(payload.jobId).catch(() => undefined);
  });
  workers.push(worker);
  return worker;
}

async function markPersistedJobFailed(jobId: string) {
  const { prisma } = await import("@/lib/db/prisma");
  await prisma.processingJob.updateMany({
    where: { id: jobId, status: { in: ["WAITING", "DELAYED", "ACTIVE"] } },
    data: { status: "FAILED", message: "Job falhou após retries", finishedAt: new Date() },
  });
}

export async function closeQueueRuntime() {
  await Promise.all(
    workers.splice(0).map(async (worker) => {
      try {
        await worker.close();
      } catch (error) {
        logger.warn({ err: error }, "worker close failed");
      }
    }),
  );
  await Promise.all(
    [...queues.values()].map(async (queue) => {
      try {
        await queue.close();
      } catch (error) {
        logger.warn({ err: error }, "queue close failed");
      }
    }),
  );
  queues.clear();
  const { resetRedisCache } = await import("@/lib/queue/redis");
  resetRedisCache();
}
