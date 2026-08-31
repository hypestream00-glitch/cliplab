import type { JobStatus } from "@/generated/prisma/client";

export type PublicJobStatus = "QUEUED" | "PROCESSING" | "COMPLETED" | "FAILED" | "CANCELED";

export function toDbJobStatus(status: PublicJobStatus): JobStatus {
  if (status === "QUEUED") return "WAITING";
  if (status === "PROCESSING") return "ACTIVE";
  return status;
}

export function toPublicJobStatus(status: JobStatus | string): PublicJobStatus | string {
  if (status === "WAITING" || status === "DELAYED") return "QUEUED";
  if (status === "ACTIVE") return "PROCESSING";
  return status;
}

export const OPEN_JOB_STATUSES: JobStatus[] = ["WAITING", "DELAYED", "ACTIVE"];
export const STALE_ACTIVE_MS = 10 * 60_000;
