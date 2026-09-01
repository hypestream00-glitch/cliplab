import { NextResponse } from "next/server";
import { essentialEnvErrors } from "@/lib/env/schema";
import { prisma } from "@/lib/db/prisma";
import { queueMode, isProductionRuntime } from "@/lib/queue/runtime";
import { isRedisConfigured } from "@/lib/queue/redis";
import { cachedRedisPing } from "@/lib/queue/redis-health";
import { s3Configured } from "@/lib/storage/s3";
import { readinessBody } from "@/lib/health/payload";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const essential = essentialEnvErrors();
  let database: "ok" | "error" = "ok";
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    database = "error";
  }

  let redis: "ok" | "error" | "unset" = "unset";
  if (isRedisConfigured()) {
    redis = await cachedRedisPing();
  } else if (isProductionRuntime()) {
    redis = "error";
  }

  const provider = (process.env.STORAGE_PROVIDER ?? "local").trim().toLowerCase() || "local";
  let storage: "ok" | "error" | "local" = "local";
  if (provider === "local") {
    storage = isProductionRuntime() ? "error" : "local";
  } else {
    storage = s3Configured() ? "ok" : "error";
  }

  const body = readinessBody({
    database,
    queue: queueMode(),
    essential: essential.map((issue) => issue.key),
    redis,
    storage,
  });
  return NextResponse.json(body, { status: body.ready ? 200 : 503 });
}
