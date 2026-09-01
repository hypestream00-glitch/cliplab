import { envFlag, socialPublishAllowed } from "@/lib/env/status";

/** BullMQ `drainDelay` is seconds of long-poll while the queue is empty. Default in the library is 5. */
export const BULLMQ_DRAIN_DELAY_SEC = 30;
export const BULLMQ_STALLED_INTERVAL_MS = 120_000;
export const WORKER_SCHEDULER_INTERVAL_MS = 60_000;

const ALWAYS_ON = ["video-import", "render", "bulk-download", "healthcheck"] as const;

export function bullmqDrainDelaySec(name?: string, source: NodeJS.ProcessEnv = process.env) {
  const raw = Number(source.BULLMQ_DRAIN_DELAY_SEC ?? BULLMQ_DRAIN_DELAY_SEC);
  const n = Number.isFinite(raw) && raw >= 5 ? Math.min(120, Math.floor(raw)) : BULLMQ_DRAIN_DELAY_SEC;
  return n;
}

export function shouldStartQueueConsumer(name: string, source: NodeJS.ProcessEnv = process.env) {
  if (name === "social-publishing") return socialPublishAllowed(source);
  if (name === "infra-probe") return envFlag("CLIPLAB_ENABLE_INFRA_PROBE", source) === true;
  if (name === "analytics-sync") return false;
  return (ALWAYS_ON as readonly string[]).includes(name);
}

export function alwaysOnQueueConsumers() {
  return [...ALWAYS_ON];
}

export function estimateIdleRedisCommandsPerHour(params?: {
  consumers?: number;
  drainDelaySec?: number;
  stalledIntervalMs?: number;
  heartbeatPerHour?: number;
}) {
  const consumers = params?.consumers ?? ALWAYS_ON.length;
  const drainDelaySec = params?.drainDelaySec ?? BULLMQ_DRAIN_DELAY_SEC;
  const stalledIntervalMs = params?.stalledIntervalMs ?? BULLMQ_STALLED_INTERVAL_MS;
  const heartbeatPerHour = params?.heartbeatPerHour ?? Math.ceil(3600 / (WORKER_SCHEDULER_INTERVAL_MS / 1000));
  const workerPolls = consumers * Math.ceil(3600 / drainDelaySec);
  const stalledChecks = consumers * Math.ceil(3600 / Math.max(1, stalledIntervalMs / 1000));
  const total = workerPolls + stalledChecks + heartbeatPerHour;
  return { consumers, drainDelaySec, workerPolls, stalledChecks, heartbeatPerHour, total };
}

export function redisIdleDiagnosticLines(started: string[], skipped: string[]) {
  const estimate = estimateIdleRedisCommandsPerHour({
    consumers: started.length,
    drainDelaySec: BULLMQ_DRAIN_DELAY_SEC,
  });
  return [
    "REDIS USAGE DIAGNOSTIC:",
    `queue consumers started: ${started.join(",") || "(none)"}`,
    `queue consumers skipped: ${skipped.join(",") || "(none)"}`,
    `idle estimate commands/hour: ${estimate.total}`,
  ];
}
