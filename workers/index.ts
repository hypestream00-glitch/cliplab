function bootLog(message: string) {
  process.stdout.write(`${message}\n`);
}

function workerBuildId() {
  const baked =
    typeof globalThis !== "undefined" && typeof (globalThis as { __CLIPLAB_WORKER_BUILD__?: string }).__CLIPLAB_WORKER_BUILD__ === "string"
      ? (globalThis as { __CLIPLAB_WORKER_BUILD__?: string }).__CLIPLAB_WORKER_BUILD__
      : "";
  const raw = (
    process.env.RAILWAY_GIT_COMMIT_SHA ||
    process.env.RAILWAY_GIT_COMMIT ||
    process.env.SOURCE_COMMIT ||
    process.env.CLIPLAB_WORKER_BUILD ||
    baked ||
    ""
  ).trim();
  return raw ? raw.slice(0, 12) : "unknown";
}

bootLog(`WORKER BUILD: ${workerBuildId()}`);
bootLog("WORKER STARTED");

type WorkerLogger = {
  error: (obj: unknown, msg?: string) => void;
  warn: (obj: unknown, msg?: string) => void;
  info: (obj: unknown, msg?: string) => void;
};

let shuttingDown = false;
let stopClipLabWorkers: (() => void) | undefined;
let closeQueueRuntime: (() => Promise<void>) | undefined;
let logger: WorkerLogger | undefined;

process.on("unhandledRejection", (reason) => {
  logger?.error({ err: reason }, "unhandledRejection");
  bootLog("WORKER UNHANDLED_REJECTION");
});
process.on("uncaughtException", (error) => {
  logger?.error({ err: error }, "uncaughtException");
  bootLog("WORKER UNCAUGHT_EXCEPTION");
});

async function boot() {
  const runtime = await import("@/lib/env/runtime");
  runtime.logWorkerEnvPresence();
  if (process.argv.includes("--check-env")) {
    process.exit(runtime.runtimeEnvPresent("REDIS_URL") && runtime.runtimeEnvPresent("DATABASE_URL") ? 0 : 1);
  }

  const preflight = await import("@/lib/queue/worker-preflight");
  await preflight.assertWorkerPreflight();

  const bootMod = await import("@/lib/queue/boot");
  const queueMod = await import("@/lib/queue");
  const emailConfig = await import("@/lib/email/config");
  const logMod = await import("@/lib/logger");
  logger = logMod.logger;
  stopClipLabWorkers = bootMod.stopClipLabWorkers;
  closeQueueRuntime = queueMod.closeQueueRuntime;

  emailConfig.logSmtpEnvPresence();
  bootMod.startClipLabWorkers();
  logger.info("CLIPLAB worker process started");
}

async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger?.info({ signal }, "CLIPLAB worker shutting down");
  stopClipLabWorkers?.();
  try {
    await closeQueueRuntime?.();
  } catch (error) {
    logger?.warn({ err: error }, "queue runtime close failed");
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
  logger?.error({ err: error }, "worker preflight failed");
  const message = error instanceof Error ? error.message : "worker boot failed";
  bootLog(`WORKER BOOT FAIL: ${message}`);
  process.exit(1);
});
