import { isUploadPostConfigured } from "@/lib/social/upload-post/config";
import { UploadPostApiError } from "@/lib/social/upload-post/errors";
import { testUploadPostConnection } from "@/lib/social/upload-post/diagnose";
import type { IntegrationHealth } from "@/lib/platforms/connection-registry";
import { logger } from "@/lib/logger";

const AUTH_BACKOFF_MS = 15 * 60 * 1000;
const OK_TTL_MS = 60 * 1000;

type CachedHealth = {
  status: IntegrationHealth;
  at: number;
};

let cache: CachedHealth | null = null;

export function peekUploadPostHealth(): IntegrationHealth | null {
  if (!cache) return null;
  if (cache.status === "AUTH_ERROR" && Date.now() - cache.at < AUTH_BACKOFF_MS) return "AUTH_ERROR";
  if (Date.now() - cache.at < OK_TTL_MS) return cache.status;
  return null;
}

export function rememberUploadPostAuthError() {
  cache = { status: "AUTH_ERROR", at: Date.now() };
}

export function rememberUploadPostHealth(status: IntegrationHealth) {
  cache = { status, at: Date.now() };
}

export function shouldCallUploadPostRemote() {
  if (!isUploadPostConfigured()) return false;
  return peekUploadPostHealth() !== "AUTH_ERROR";
}

export async function resolveUploadPostHealth(): Promise<IntegrationHealth> {
  if (!isUploadPostConfigured()) {
    rememberUploadPostHealth("NOT_CONFIGURED");
    return "NOT_CONFIGURED";
  }
  const cached = peekUploadPostHealth();
  if (cached) return cached;
  try {
    const probe = await testUploadPostConnection();
    const status: IntegrationHealth =
      probe === "CONNECTED" ? "READY" : probe === "INVALID_KEY" ? "AUTH_ERROR" : probe === "PLAN_LIMITATION" ? "REQUIRES_APPROVAL" : "DEGRADED";
    rememberUploadPostHealth(status);
    if (status === "AUTH_ERROR") {
      logger.warn({ provider: "UPLOAD_POST", operation: "health", status }, "upload-post auth error; backing off");
    }
    return status;
  } catch (error) {
    if (error instanceof UploadPostApiError && error.status === 401) {
      rememberUploadPostAuthError();
      return "AUTH_ERROR";
    }
    rememberUploadPostHealth("DEGRADED");
    return "DEGRADED";
  }
}

export function noteUploadPostError(error: unknown) {
  if (error instanceof UploadPostApiError && error.status === 401) {
    rememberUploadPostAuthError();
  }
}

export function resetUploadPostHealthForTests() {
  cache = null;
}
