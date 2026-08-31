import { randomStorageKey } from "@/lib/storage";
import { workspacePrefix } from "@/lib/storage/keys";
import { s3Configured } from "@/lib/storage/s3";

export const SIGNED_PUT_TTL_SEC = 20 * 60;
export const MAX_ACTIVE_UPLOAD_SESSIONS = 5;
export const DEFAULT_MAX_UPLOAD_BYTES = 10 * 1024 * 1024 * 1024;

export function configuredMaxUploadBytes() {
  const raw = Number(process.env.MAX_VIDEO_UPLOAD_BYTES ?? "");
  if (Number.isFinite(raw) && raw > 0) return Math.floor(raw);
  return DEFAULT_MAX_UPLOAD_BYTES;
}

export function effectiveMaxUploadBytes(planMaxBytes: number) {
  return Math.min(planMaxBytes, configuredMaxUploadBytes());
}

export function directObjectUploadEnabled() {
  const provider = (process.env.STORAGE_PROVIDER ?? "local").trim().toLowerCase();
  return (provider === "r2" || provider === "s3" || provider === "b2") && s3Configured();
}

export function uploadObjectKey(workspaceId: string, uploadId: string, filename: string) {
  return randomStorageKey(filename, `${workspacePrefix(workspaceId)}/uploads/${uploadId}`);
}

export function isUploadExpired(expiresAt: Date, now = new Date()) {
  return expiresAt.getTime() <= now.getTime();
}

export function objectMatchesExpectedSize(expectedSize: number | bigint, actualSize: number | bigint) {
  const expected = Number(expectedSize);
  const actual = Number(actualSize);
  if (!Number.isFinite(actual) || actual <= 0) return { ok: false as const, reason: "empty" };
  if (actual !== expected) return { ok: false as const, reason: "size_mismatch" };
  return { ok: true as const };
}

export function objectMatchesExpectedMime(expected: string, actual?: string | null) {
  if (!actual) return { ok: true as const };
  const got = actual.split(";")[0]?.trim().toLowerCase() ?? "";
  const want = expected.split(";")[0]?.trim().toLowerCase() ?? "";
  if (!got || got === "application/octet-stream" || got === "binary/octet-stream") return { ok: true as const };
  if (got === want) return { ok: true as const };
  return { ok: false as const, reason: "mime_mismatch" };
}

export function prismaIntSize(bytes: number | bigint) {
  const value = Number(bytes);
  if (!Number.isFinite(value) || value < 0) return undefined;
  return Math.min(Math.floor(value), 2147483647);
}

export function canCleanupOrphanUpload(params: {
  status: string;
  projectId: string | null;
  expiresAt: Date;
  now?: Date;
}) {
  if (params.projectId) return false;
  if (!isUploadExpired(params.expiresAt, params.now ?? new Date())) return false;
  if (params.status === "VALIDATING") {
    const grace = new Date(params.expiresAt.getTime() + 60 * 60 * 1000);
    return isUploadExpired(grace, params.now ?? new Date());
  }
  return ["PENDING", "UPLOADING", "UPLOADED", "FAILED", "EXPIRED"].includes(params.status);
}
