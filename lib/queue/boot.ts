import { createProjectPipelineWorker } from "@/workers/video-processing";
import { createRenderWorker } from "@/workers/render";
import { createPublishWorker } from "@/workers/social-publishing";
import { createBulkDownloadWorker } from "@/workers/bulk-download";
import { createAnalyticsWorker } from "@/workers/analytics";
import { createInfraProbeWorker } from "@/workers/infra-probe";
import { createHealthcheckWorker } from "@/workers/healthcheck";
import { recoverPersistedJobs } from "@/lib/services/job-recovery";
import { shouldEmbedWorkers } from "@/lib/queue/runtime";
import { isNextBuildPhase } from "@/lib/env/build-phase";
import { logger } from "@/lib/logger";
import { startWorkerScheduler, stopWorkerScheduler } from "@/lib/queue/scheduler";
import { redisIdleDiagnosticLines } from "@/lib/queue/consumers";
import { QUEUE_NAMES, startedQueueConsumers } from "@/lib/queue";

let started = false;

export function startClipLabWorkers() {
  if (started) return;
  started = true;
  createProjectPipelineWorker();
  createRenderWorker();
  createPublishWorker();
  createBulkDownloadWorker();
  createAnalyticsWorker();
  createInfraProbeWorker();
  createHealthcheckWorker();
  void recoverPersistedJobs().catch((error) => logger.warn({ err: error }, "initial job recovery failed"));
  startWorkerScheduler();
  const startedNames = startedQueueConsumers();
  const skipped = QUEUE_NAMES.filter((name) => !startedNames.includes(name));
  for (const line of redisIdleDiagnosticLines(startedNames, skipped)) {
    process.stdout.write(`${line}\n`);
  }
  logger.info({ embedded: shouldEmbedWorkers(), consumers: startedNames }, "CLIPLAB workers registered");
}

export function stopClipLabWorkers() {
  stopWorkerScheduler();
  started = false;
}

export function workersBooted() {
  return started;
}

export function ensureDevWorkers() {
  if (isNextBuildPhase()) return;
  if (!shouldEmbedWorkers()) return;
  startClipLabWorkers();
}
