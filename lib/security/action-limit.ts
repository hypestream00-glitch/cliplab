import { headers } from "next/headers";
import { rateLimitAsync } from "@/lib/security/rate-limit";

export async function limitAction(scope: string, limit: number, windowMs: number) {
  const headerList = await headers();
  const ip = headerList.get("x-forwarded-for")?.split(",")[0]?.trim() || headerList.get("x-real-ip") || "local";
  return rateLimitAsync({ key: `${scope}:${ip}`, limit, windowMs });
}
