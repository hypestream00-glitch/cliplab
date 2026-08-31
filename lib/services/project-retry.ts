import { prisma } from "@/lib/db/prisma";
import { enqueue } from "@/lib/queue";
import { resumeJobDecision } from "@/lib/pipeline/resume-decision";
import { toDbJobStatus } from "@/lib/jobs/status";

export { resumeJobDecision };

export async function resumeProjectProcessing(workspaceId: string, projectId: string) {
  const project = await prisma.project.findFirst({
    where: { id: projectId, workspaceId },
    include: { sourceVideo: true },
  });
  if (!project) return null;
  if (!project.sourceVideo?.storageKey) {
    throw new Error("Vídeo de origem ausente. Envie o arquivo novamente.");
  }

  const latest = await prisma.processingJob.findFirst({
    where: { entityId: project.id, type: "VIDEO_IMPORT" },
    orderBy: { createdAt: "desc" },
  });
  const decision = resumeJobDecision(latest?.status);
  if (decision === "skip" && latest) {
    return { project, skipped: true as const, jobId: latest.id };
  }

  await prisma.project.update({
    where: { id: project.id },
    data: { status: "QUEUED", errorMessage: null },
  });

  let jobId: string;
  if (decision === "reuse" && latest) {
    await prisma.processingJob.update({
      where: { id: latest.id },
      data: {
        status: toDbJobStatus("QUEUED"),
        progress: 0,
        message: "Retomando",
        errorMessage: null,
        startedAt: null,
        finishedAt: null,
      },
    });
    jobId = latest.id;
  } else {
    const job = await prisma.processingJob.create({
      data: {
        workspaceId,
        projectId: project.id,
        type: "VIDEO_IMPORT",
        entityId: project.id,
        status: toDbJobStatus("QUEUED"),
        message: "Retomando",
      },
    });
    jobId = job.id;
  }

  await enqueue("video-import", {
    jobId,
    workspaceId,
    entityId: project.id,
    type: "video-import",
  });
  return { project, skipped: false as const, jobId };
}
