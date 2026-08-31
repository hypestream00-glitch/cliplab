import { prisma } from "@/lib/db/prisma";
import { enqueue } from "@/lib/queue";
import { getStorage } from "@/lib/storage";
import { withJobTempDir, materializeObject, localOutputPath, commitLocalFile } from "@/lib/storage/materialize";
import { toDbJobStatus } from "@/lib/jobs/status";
import { writeStoreZip, removeFile } from "@/lib/zip/store";
import { logger } from "@/lib/logger";

export async function enqueueBulkDownload(workspaceId: string, clipIds: string[]) {
  const clips = await prisma.clip.findMany({
    where: { workspaceId, id: { in: clipIds }, storageKey: { not: null } },
  });
  if (clips.length === 0) throw new Error("Nenhum clipe com arquivo real selecionado.");
  const job = await prisma.processingJob.create({
    data: {
      workspaceId,
      type: "BULK_DOWNLOAD",
      entityId: `bulk:${clips.length}`,
      status: toDbJobStatus("QUEUED"),
      message: "ZIP na fila",
      errorCode: JSON.stringify(clips.map((clip) => clip.id)),
    },
  });
  await enqueue("bulk-download", {
    jobId: job.id,
    workspaceId,
    entityId: job.id,
    type: "bulk-download",
  });
  return job;
}

export async function processBulkDownload(jobId: string) {
  const job = await prisma.processingJob.findUnique({ where: { id: jobId } });
  if (!job) return;
  let clipIds: string[] = [];
  try {
    clipIds = JSON.parse(job.errorCode ?? "[]") as string[];
  } catch {
    clipIds = [];
  }
  const tmpKey = `zips/${job.workspaceId}/${job.id}.zip`;
  try {
    await withJobTempDir(async (tmp) => {
      await prisma.processingJob.update({
        where: { id: job.id },
        data: { status: toDbJobStatus("PROCESSING"), progress: 10, startedAt: new Date(), message: "Gerando ZIP" },
      });
      const clips = await prisma.clip.findMany({
        where: { workspaceId: job.workspaceId, id: { in: clipIds }, storageKey: { not: null } },
      });
      const entries = [];
      for (const clip of clips) {
        const exists = await getStorage().exists(clip.storageKey!);
        if (!exists) continue;
        const filePath = await materializeObject(clip.storageKey!, tmp, `${clip.id}.mp4`);
        const safe = `${clip.title.replace(/[^\w\-]+/g, "_").slice(0, 40) || "clip"}-${clip.id.slice(-6)}.mp4`;
        entries.push({ name: safe, filePath });
      }
      if (entries.length === 0) throw new Error("Nenhum arquivo de clipe encontrado no storage.");
      const abs = await localOutputPath(tmpKey, tmp, `${job.id}.zip`);
      await writeStoreZip({ entries, outputPath: abs });
      await commitLocalFile(abs, tmpKey, "application/zip");
      if (getStorage().name === "local") {
        /* zip already at storage path */
      }
      await prisma.processingJob.update({
        where: { id: job.id },
        data: {
          status: "COMPLETED",
          progress: 100,
          finishedAt: new Date(),
          message: tmpKey,
          errorCode: JSON.stringify(clipIds),
        },
      });
    });
  } catch (error) {
    logger.error({ err: error, jobId }, "bulk zip failed");
    const abs = getStorage().getAbsolutePath(tmpKey);
    if (abs) await removeFile(abs);
    else await getStorage().deleteObject(tmpKey).catch(() => undefined);
    await prisma.processingJob.update({
      where: { id: job.id },
      data: {
        status: "FAILED",
        errorMessage: error instanceof Error ? error.message : "Falha ao gerar ZIP",
        finishedAt: new Date(),
      },
    });
  }
}
