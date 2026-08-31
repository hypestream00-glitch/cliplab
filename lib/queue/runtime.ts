import { isRedisConfigured } from "@/lib/queue/redis";

export function isProductionRuntime() {
  return process.env.NODE_ENV === "production";
}

export function queueMode(): "redis" | "local" | "unavailable" {
  if (isRedisConfigured()) return "redis";
  if (isProductionRuntime()) return "unavailable";
  return "local";
}

export function isQueueMocked() {
  return queueMode() !== "redis";
}

export function shouldEmbedWorkers() {
  const raw = process.env.CLIPLAB_EMBED_WORKERS?.trim().toLowerCase();
  if (raw === "true" || raw === "1" || raw === "yes" || raw === "on") return true;
  if (raw === "false" || raw === "0" || raw === "no" || raw === "off") return false;
  return !isProductionRuntime();
}
