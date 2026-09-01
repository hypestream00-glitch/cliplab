import { VIDEO_EXT } from "@/lib/ingest/url";

export function isVideoContentType(type: string, url: string) {
  const lower = type.toLowerCase();
  if (lower.startsWith("video/")) return true;
  if (lower === "application/octet-stream") return true;
  return VIDEO_EXT.test(url);
}

export function mimeFromVideoType(type: string, filename: string) {
  const lower = type.toLowerCase();
  if (lower.includes("webm") || filename.toLowerCase().endsWith(".webm")) return "video/webm";
  if (lower.includes("quicktime") || filename.toLowerCase().endsWith(".mov")) return "video/quicktime";
  return "video/mp4";
}
