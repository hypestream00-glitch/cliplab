export type WorkerPreflightInput = {
  redisConfigured: boolean;
  redisPingOk: boolean;
  databaseOk: boolean;
  storageOk: boolean;
  ffmpegOk: boolean;
};

export type WorkerPreflightResult = {
  ok: boolean;
  failures: string[];
};

export function evaluateWorkerPreflight(input: WorkerPreflightInput): WorkerPreflightResult {
  const failures: string[] = [];
  if (!input.redisConfigured) failures.push("REDIS_URL required");
  else if (!input.redisPingOk) failures.push("Redis ping failed");
  if (!input.databaseOk) failures.push("database unavailable");
  if (!input.storageOk) failures.push("object storage not configured");
  if (!input.ffmpegOk) failures.push("FFmpeg/ffprobe unavailable");
  return { ok: failures.length === 0, failures };
}

export function workerComponentLines(input: WorkerPreflightInput) {
  const redisOk = input.redisConfigured && input.redisPingOk;
  return {
    database: input.databaseOk ? "OK" : "FAIL",
    redis: redisOk ? "OK" : "FAIL",
    bullmq: redisOk ? "READY" : "FAIL",
    ffmpeg: input.ffmpegOk ? "OK" : "FAIL",
  } as const;
}

export function logWorkerReadyBanner(input: WorkerPreflightInput, ready: boolean) {
  const lines = workerComponentLines(input);
  console.log("WORKER STARTED");
  console.log(`DATABASE: ${lines.database}`);
  console.log(`REDIS: ${lines.redis}`);
  console.log(`BULLMQ: ${lines.bullmq}`);
  console.log(`FFMPEG: ${lines.ffmpeg}`);
  if (ready) console.log("WORKER READY");
}

export async function collectWorkerPreflightInput(): Promise<WorkerPreflightInput> {
  const { isRedisConfigured, getSharedRedis } = await import("@/lib/queue/redis");
  const { isProductionRuntime } = await import("@/lib/queue/runtime");
  const { s3Configured } = await import("@/lib/storage/s3");
  const { isFfmpegAvailable } = await import("@/lib/ffmpeg");
  const { prisma } = await import("@/lib/db/prisma");

  let redisPingOk = false;
  if (isRedisConfigured()) {
    try {
      redisPingOk = (await getSharedRedis()?.ping()) === "PONG";
    } catch {
      redisPingOk = false;
    }
  }

  let databaseOk = false;
  try {
    await prisma.$queryRaw`SELECT 1`;
    databaseOk = true;
  } catch {
    databaseOk = false;
  }

  const production = isProductionRuntime();
  return {
    redisConfigured: isRedisConfigured(),
    redisPingOk,
    databaseOk,
    storageOk: production ? s3Configured() : true,
    ffmpegOk: await isFfmpegAvailable(),
  };
}

export async function assertWorkerPreflight() {
  const input = await collectWorkerPreflightInput();
  const result = evaluateWorkerPreflight(input);
  logWorkerReadyBanner(input, result.ok);
  if (!result.ok) {
    throw new Error(`WORKER PREFLIGHT FAIL: ${result.failures.join("; ")}`);
  }
  return result;
}
