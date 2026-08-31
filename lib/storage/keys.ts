import { sanitizeKey } from "@/lib/storage/url";

export function workspacePrefix(workspaceId: string) {
  return `ws/${workspaceId}`;
}

export function projectObjectKey(params: {
  workspaceId: string;
  projectId: string;
  kind: "uploads" | "audio" | "thumbs" | "clips" | "renders" | "zips" | "overlays";
  filename: string;
}) {
  return `${workspacePrefix(params.workspaceId)}/${params.kind}/${params.projectId}/${sanitizeKey(params.filename).split("/").pop()}`;
}

export function keyBelongsToWorkspace(key: string, workspaceId: string) {
  const safe = sanitizeKey(key);
  return (
    safe.startsWith(`${workspacePrefix(workspaceId)}/`) ||
    safe.startsWith(`uploads/${workspaceId}/`) ||
    safe.startsWith(`audio/${workspaceId}/`) ||
    safe.startsWith(`thumbs/${workspaceId}/`) ||
    safe.startsWith(`clips/${workspaceId}/`) ||
    safe.startsWith(`renders/${workspaceId}/`) ||
    safe.startsWith(`zips/${workspaceId}/`) ||
    safe.startsWith(`overlays/${workspaceId}/`)
  );
}

export function guessObjectMime(key: string) {
  const lower = key.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".zip")) return "application/zip";
  if (lower.endsWith(".mp3")) return "audio/mpeg";
  if (lower.endsWith(".webm")) return "video/webm";
  if (lower.endsWith(".mov")) return "video/quicktime";
  if (lower.endsWith(".txt")) return "text/plain";
  return "video/mp4";
}
