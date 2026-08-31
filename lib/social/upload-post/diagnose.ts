import { isProductionRuntime } from "@/lib/queue/runtime";
import { isUploadPostConfigured, uploadPostWebhookSecret } from "@/lib/social/upload-post/config";
import { UploadPostApiError, UploadPostPlanError } from "@/lib/social/upload-post/errors";
import { uploadPostRequest } from "@/lib/social/upload-post/http";

export type UploadPostStatusCode = "READY" | "CONFIGURATION_REQUIRED" | "PLAN_REQUIRED" | "INVALID_CREDENTIALS" | "ERROR";
export type UploadPostProbeCode = "CONNECTED" | "INVALID_KEY" | "PLAN_LIMITATION" | "API_ERROR" | "NETWORK_ERROR";

function isNetworkError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const err = error as { name?: string; code?: string; cause?: { code?: string }; message?: string };
  const code = String(err.code ?? err.cause?.code ?? "");
  if (["ENOTFOUND", "ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", "ENETUNREACH", "UND_ERR_CONNECT_TIMEOUT"].includes(code)) {
    return true;
  }
  return err.name === "TypeError" && /fetch failed|network|ECONNREFUSED|ENOTFOUND/i.test(err.message ?? "");
}

export async function testUploadPostConnection(): Promise<UploadPostProbeCode> {
  if (!isUploadPostConfigured()) return "INVALID_KEY";
  try {
    const result = await uploadPostRequest({ method: "GET", path: "/uploadposts/me" });
    if (result.status === 200) return "CONNECTED";
    if (result.status === 401) return "INVALID_KEY";
    if (result.status === 403) return "PLAN_LIMITATION";
    return "API_ERROR";
  } catch (error) {
    if (isNetworkError(error)) return "NETWORK_ERROR";
    if (error instanceof UploadPostPlanError) return "PLAN_LIMITATION";
    if (error instanceof UploadPostApiError && error.status === 401) return "INVALID_KEY";
    return "API_ERROR";
  }
}

export async function getUploadPostStatus(): Promise<UploadPostStatusCode> {
  if (!isUploadPostConfigured()) return "CONFIGURATION_REQUIRED";
  const probe = await testUploadPostConnection();
  if (probe === "CONNECTED") return "READY";
  if (probe === "PLAN_LIMITATION") return "PLAN_REQUIRED";
  if (probe === "INVALID_KEY") return "INVALID_CREDENTIALS";
  return "ERROR";
}

export function uploadPostWebhookStatus(): "READY" | "OPTIONAL" | "CONFIGURATION_REQUIRED" {
  if (uploadPostWebhookSecret()) return "READY";
  if (isProductionRuntime()) return "CONFIGURATION_REQUIRED";
  return "OPTIONAL";
}

export function probeMessage(code: UploadPostProbeCode) {
  if (code === "CONNECTED") return "CONNECTED";
  if (code === "INVALID_KEY") return "INVALID_KEY";
  if (code === "PLAN_LIMITATION") return "PLAN_LIMITATION";
  if (code === "NETWORK_ERROR") return "NETWORK_ERROR";
  return "API_ERROR";
}
