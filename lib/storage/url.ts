import { publicBaseUrl } from "@/lib/env/app-url";

export function sanitizeKey(key: string) {
  const cleaned = key.replaceAll("\\", "/").replaceAll("..", "").replace(/^\/+/, "");
  if (!cleaned || cleaned.includes("\0")) {
    throw new Error("Storage key inválida.");
  }
  return cleaned;
}

export function mediaUrl(key: string | null | undefined) {
  if (!key) return null;
  return `/api/media?key=${encodeURIComponent(sanitizeKey(key))}`;
}

export function publicMediaUrl(key: string) {
  return `${publicBaseUrl()}/api/media?key=${encodeURIComponent(sanitizeKey(key))}`;
}
