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

export async function assertWorkerPreflight() {
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
  const storageOk = production ? s3Configured() : true;
  const ffmpegOk = await isFfmpegAvailable();
  const result = evaluateWorkerPreflight({
    redisConfigured: isRedisConfigured(),
    redisPingOk,
    databaseOk,
    storageOk,
    ffmpegOk,
  });
  if (!result.ok) {
    throw new Error(`WORKER PREFLIGHT FAIL: ${result.failures.join("; ")}`);
  }
  return result;
}
