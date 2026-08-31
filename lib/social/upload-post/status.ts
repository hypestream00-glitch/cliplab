import type { PublicationStatus } from "@/generated/prisma/client";

export function mapUploadPostStatus(value: string | undefined | null, opts?: { scheduled?: boolean }): PublicationStatus {
  const status = (value ?? "").toLowerCase();
  if (status === "pending" && opts?.scheduled) return "SCHEDULED";
  if (status === "pending" || status === "queued") return "QUEUED";
  if (status === "processing" || status === "in_progress") return "PROCESSING";
  if (status === "uploading") return "UPLOADING";
  if (status === "completed") return "PUBLISHED";
  if (status === "failed") return "FAILED";
  if (status === "cancelled" || status === "canceled") return "CANCELED";
  if (status === "scheduled") return "SCHEDULED";
  return "PROCESSING";
}

export function mapPlatformResultStatus(result: {
  success?: boolean;
  status?: string;
  skipped?: boolean;
  fallback_to_inbox?: boolean;
}): PublicationStatus {
  if (result.skipped) return "FAILED";
  if (result.fallback_to_inbox) return "PROCESSING";
  const status = (result.status ?? "").toLowerCase();
  if (status === "completed" || result.success === true) return "PUBLISHED";
  if (status === "failed") return "FAILED";
  if (status === "queued") return "QUEUED";
  if (status === "processing" || status === "retryable") return "PROCESSING";
  if (result.success === false) return "FAILED";
  return "PROCESSING";
}

export function publicationStatusFromResults(params: {
  topStatus?: string;
  scheduled?: boolean;
  results?: Array<{ success?: boolean; status?: string; skipped?: boolean; fallback_to_inbox?: boolean }>;
}): PublicationStatus {
  const results = params.results ?? [];
  if (results.length) {
    const mapped = results.map(mapPlatformResultStatus);
    if (mapped.every((item) => item === "PUBLISHED")) return "PUBLISHED";
    if (mapped.some((item) => item === "FAILED") && mapped.every((item) => item === "FAILED" || item === "PUBLISHED")) {
      return "FAILED";
    }
    if (mapped.some((item) => item === "UPLOADING")) return "UPLOADING";
    if (mapped.some((item) => item === "QUEUED")) return "QUEUED";
    return "PROCESSING";
  }
  const mapped = mapUploadPostStatus(params.topStatus, { scheduled: params.scheduled });
  if (mapped === "PUBLISHED" && !results.length) return "PROCESSING";
  return mapped;
}
