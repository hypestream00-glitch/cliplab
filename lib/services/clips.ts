import { prisma } from "@/lib/db/prisma";

export async function archiveClip(workspaceId: string, clipId: string) {
  const clip = await prisma.clip.findFirst({ where: { id: clipId, workspaceId } });
  if (!clip) return null;
  return prisma.clip.update({ where: { id: clip.id }, data: { status: "ARCHIVED" } });
}

export async function deleteClip(workspaceId: string, clipId: string) {
  const clip = await prisma.clip.findFirst({ where: { id: clipId, workspaceId } });
  if (!clip) return null;
  await prisma.clip.delete({ where: { id: clip.id } });
  return clip;
}

export async function duplicateClip(workspaceId: string, clipId: string) {
  const clip = await prisma.clip.findFirst({
    where: { id: clipId, workspaceId },
    include: { score: true },
  });
  if (!clip) return null;
  const copy = await prisma.clip.create({
    data: {
      workspaceId: clip.workspaceId,
      projectId: clip.projectId,
      title: `${clip.title} (cópia)`,
      summary: clip.summary,
      reason: clip.reason,
      startMs: clip.startMs,
      endMs: clip.endMs,
      durationMs: clip.durationMs,
      status: "READY",
      thumbnailKey: clip.thumbnailKey,
      storageKey: clip.storageKey,
      width: clip.width,
      height: clip.height,
      sizeBytes: clip.sizeBytes,
      hashtags: clip.hashtags,
      description: clip.description,
    },
  });
  if (clip.score) {
    await prisma.clipScore.create({
      data: {
        clipId: copy.id,
        overall: clip.score.overall,
        hookScore: clip.score.hookScore,
        retentionScore: clip.score.retentionScore,
        clarityScore: clip.score.clarityScore,
        emotionScore: clip.score.emotionScore,
      },
    });
  }
  return copy;
}
