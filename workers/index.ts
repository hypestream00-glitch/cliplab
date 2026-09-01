import "@/lib/env/load-local";
import { logWorkerEnvPresence, runtimeEnvPresent } from "@/lib/env/runtime";
import { startClipLabWorkers, stopClipLabWorkers } from "@/lib/queue/boot";
import { closeQueueRuntime } from "@/lib/queue";
import { beatWorker } from "@/lib/queue/heartbeat";
import { logger } from "@/lib/logger";
import { processEmailOutbox } from "@/lib/email/outbox";
import { assertWorkerPreflight } from "@/lib/queue/worker-preflight";

let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let shuttingDown = false;

async function boot() {
  logWorkerEnvPresence();
  if (process.argv.includes("--check-env")) {
    process.exit(runtimeEnvPresent("REDIS_URL") && runtimeEnvPresent("DATABASE_URL") ? 0 : 1);
  }
  await assertWorkerPreflight();
  startClipLabWorkers();
  void beatWorker();
  void processEmailOutbox().catch(() => undefined);
  heartbeatTimer = setInterval(() => {
    void beatWorker().catch(() => undefined);
    void processEmailOutbox().catch(() => undefined);
  }, 15_000);
  logger.info("CLIPLAB worker process started");
}

process.on("unhandledRejection", (reason) => {
  logger.error({ err: reason }, "unhandledRejection");
});
process.on("uncaughtException", (error) => {
  logger.error({ err: error }, "uncaughtException");
});

async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, "CLIPLAB worker shutting down");
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
  stopClipLabWorkers();
  try {
    await closeQueueRuntime();
  } catch (error) {
    logger.warn({ err: error }, "queue runtime close failed");
  }
  process.exit(0);
}

process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});
process.on("SIGINT", () => {
  void shutdown("SIGINT");
});

void boot().catch((error) => {
  logger.error({ err: error }, "worker preflight failed");
  process.exit(1);
});
