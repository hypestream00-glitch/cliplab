import { envPresent } from "@/lib/env/status";

export const UPLOAD_POST_DEFAULT_BASE = "https://api.upload-post.com/api";

export function uploadPostApiKey() {
  return process.env.UPLOAD_POST_API_KEY?.trim() ?? "";
}

export function isUploadPostConfigured() {
  return envPresent("UPLOAD_POST_API_KEY");
}

export function uploadPostApiBase() {
  return (process.env.UPLOAD_POST_API_BASE ?? UPLOAD_POST_DEFAULT_BASE).replace(/\/$/, "");
}

export function uploadPostWebhookSecret() {
  return process.env.UPLOAD_POST_WEBHOOK_SECRET?.trim() ?? "";
}

export function profileUsernameForWorkspace(workspaceId: string) {
  return `cliplab_${workspaceId}`;
}
