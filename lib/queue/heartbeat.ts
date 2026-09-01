import { writeFile, readFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { isRedisConfigured } from "@/lib/queue/redis";
import { recordRedisUsage } from "@/lib/queue/redis-usage";

const FILE = path.join(tmpdir(), "cliplab-worker-heartbeat");
const STALE_MS = 180_000;

export async function beatWorker() {
  const stamp = String(Date.now());
  await mkdir(path.dirname(FILE), { recursive: true }).catch(() => undefined);
  await writeFile(FILE, stamp, "utf8").catch(() => undefined);
  if (!isRedisConfigured()) return;
  try {
    const { ensureSharedRedis } = await import("@/lib/queue/redis");
    const redis = await ensureSharedRedis();
    if (redis) {
      recordRedisUsage("heartbeat");
      await redis.set("cliplab:worker:heartbeat", stamp, "EX", 180);
    }
  } catch {
    /* heartbeat is best-effort */
  }
}

export async function workerHeartbeatAgeMs(): Promise<number | null> {
  if (isRedisConfigured()) {
    try {
      const { ensureSharedRedis } = await import("@/lib/queue/redis");
      const redis = await ensureSharedRedis();
      const value = redis ? await redis.get("cliplab:worker:heartbeat") : null;
      if (value) return Date.now() - Number(value);
    } catch {
      /* fall through to file */
    }
  }
  try {
    const value = await readFile(FILE, "utf8");
    const n = Number(value.trim());
    return Number.isFinite(n) ? Date.now() - n : null;
  } catch {
    return null;
  }
}

export async function workerRuntimeStatus(): Promise<"CONNECTED" | "NOT RUNNING"> {
  const age = await workerHeartbeatAgeMs();
  if (age != null && age < STALE_MS) return "CONNECTED";
  return "NOT RUNNING";
}
