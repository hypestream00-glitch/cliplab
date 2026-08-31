import { prisma } from "@/lib/db/prisma";
import { sanitizeKey } from "@/lib/storage/url";
import { keyBelongsToWorkspace } from "@/lib/storage/keys";

export async function authorizeMediaKey(workspaceId: string, rawKey: string) {
  const key = sanitizeKey(rawKey);
  if (key.includes("ws/") && !keyBelongsToWorkspace(key, workspaceId)) {
    return null;
  }
  if (key.startsWith(`overlays/${workspaceId}/`)) {
    return { key, mime: guessMime(key) };
  }
  if (key.startsWith(`zips/${workspaceId}/`)) {
    return { key, mime: "application/zip" };
  }
  const source = await prisma.sourceVideo.findFirst({
    where: {
      project: { workspaceId },
      OR: [{ storageKey: key }, { thumbnailKey: key }, { audioStorageKey: key }],
    },
  });
  if (source) {
    const mime =
      source.storageKey === key
        ? source.mimeType ?? "video/mp4"
        : source.audioStorageKey === key
          ? "audio/mpeg"
          : "image/jpeg";
    return { key, mime };
  }
  const clip = await prisma.clip.findFirst({
    where: { workspaceId, OR: [{ storageKey: key }, { thumbnailKey: key }] },
  });
  if (clip) {
    return { key, mime: clip.storageKey === key ? "video/mp4" : "image/jpeg" };
  }
  const asset = await prisma.renderedAsset.findFirst({
    where: { storageKey: key, clip: { workspaceId } },
  });
  if (asset) return { key, mime: asset.mimeType || "video/mp4" };
  const session = await prisma.uploadSession.findFirst({
    where: { workspaceId, storageKey: key },
  });
  if (session) {
    return { key, mime: session.expectedMime || guessMime(key) };
  }
  return null;
}

function guessMime(key: string) {
  if (key.endsWith(".png")) return "image/png";
  if (key.endsWith(".jpg") || key.endsWith(".jpeg")) return "image/jpeg";
  if (key.endsWith(".webp")) return "image/webp";
  if (key.endsWith(".zip")) return "application/zip";
  if (key.endsWith(".mp3")) return "audio/mpeg";
  if (key.endsWith(".webm")) return "video/webm";
  if (key.endsWith(".mov")) return "video/quicktime";
  return "video/mp4";
}
