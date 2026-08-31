import { prisma } from "@/lib/db/prisma";
import { enqueue } from "@/lib/queue";
import { getStorage, randomStorageKey } from "@/lib/storage";
import { withJobTempDir, materializeObject, localOutputPath, commitLocalFile } from "@/lib/storage/materialize";
import { toDbJobStatus } from "@/lib/jobs/status";
import {
  defaultFontFile,
  FFmpegUnavailableError,
  isFfmpegAvailable,
  probeVideo,
  renderEditedVideo,
} from "@/lib/ffmpeg";
import { canvasSize, outputSize, parseCanvas, type EditorOverlay } from "@/lib/editor/state";
import { labelFromAspectRatio } from "@/lib/services/editor";
import { logger } from "@/lib/logger";
import { tmpdir } from "node:os";
import { buildAssDocument, removeTempAssFile, writeTempAssFile } from "@/lib/captions/ass";
import { formatCaptions, type CaptionCue } from "@/lib/captions/format";
import { getCaptionPreset } from "@/lib/captions/presets";
import { notifyWorkspace } from "@/lib/services/notifications";

export async function enqueueRender(workspaceId: string, clipId: string, resolution: "720p" | "1080p" = "1080p") {
  const clip = await prisma.clip.findFirst({ where: { id: clipId, workspaceId } });
  if (!clip) throw new Error("Clip não encontrado");
  if (!(await isFfmpegAvailable())) {
    throw new FFmpegUnavailableError();
  }
  const { getWorkspacePlanCode, assertWorkspaceJobQuota } = await import("@/lib/billing/usage");
  const { clampExportResolution } = await import("@/lib/config/plans");
  const planCode = await getWorkspacePlanCode(workspaceId);
  const clamped = clampExportResolution(planCode, resolution);
  await assertWorkspaceJobQuota(workspaceId, "export");
  await prisma.clip.update({ where: { id: clip.id }, data: { status: "RENDERING" } });
  const job = await prisma.renderJob.create({
    data: {
      workspaceId,
      clipId: clip.id,
      resolution: clamped,
      fps: 30,
      status: "WAITING",
    },
  });
  const processing = await prisma.processingJob.create({
    data: {
      workspaceId,
      type: "RENDER",
      entityId: job.id,
      status: toDbJobStatus("QUEUED"),
      message: "Render na fila",
    },
  });
  await enqueue("render", {
    jobId: processing.id,
    workspaceId,
    entityId: job.id,
    type: "render",
  });
  return job;
}

export async function processRender(renderJobId: string) {
  const job = await prisma.renderJob.findUnique({
    where: { id: renderJobId },
    include: {
      clip: {
        include: {
          editorProject: { include: { elements: true } },
          project: { include: { sourceVideo: true, transcript: { include: { segments: { orderBy: { startMs: "asc" } } } } } },
        },
      },
    },
  });
  if (!job) return;

  const fail = async (error: unknown) => {
    const message = error instanceof Error ? error.message : "Falha no render";
    logger.error({ err: error, renderJobId }, "render failed");
    await prisma.renderJob.update({
      where: { id: job.id },
      data: { status: "FAILED", errorMessage: message, finishedAt: new Date() },
    });
    await prisma.clip.update({ where: { id: job.clipId }, data: { status: "FAILED" } });
    await prisma.processingJob.updateMany({
      where: { entityId: job.id, type: "RENDER" },
      data: { status: "FAILED", errorMessage: message, finishedAt: new Date() },
    });
    await notifyWorkspace({
      workspaceId: job.workspaceId,
      type: "PROCESSING_FAILED",
      title: "Render falhou",
      body: message,
      entityType: "RenderJob",
      entityId: job.id,
    });
  };

  try {
    await withJobTempDir(async (tmp) => {
    if (!(await isFfmpegAvailable())) throw new FFmpegUnavailableError();
    const clip = job.clip;
    const inputKey = clip.storageKey;
    if (!inputKey) throw new Error("Este clipe ainda não tem arquivo de vídeo. Reprocesse o projeto.");
    const inputPath = await materializeObject(inputKey, tmp, "clip-input.mp4");

    await prisma.renderJob.update({ where: { id: job.id }, data: { status: "RENDERING", progress: 8 } });
    await prisma.processingJob.updateMany({
      where: { entityId: job.id, type: "RENDER" },
      data: { status: toDbJobStatus("PROCESSING"), progress: 8, message: "Compondo com FFmpeg", startedAt: new Date() },
    });

    const ratio = clip.editorProject ? labelFromAspectRatio(clip.editorProject.aspectRatio) : "9:16";
    const canvas = parseCanvas(clip.editorProject?.canvasJson, clip.durationMs);
    const resolution = job.resolution === "720p" ? "720p" : "1080p";
    const size = outputSize(ratio, resolution);
    const canonical = canvasSize(ratio);
    const sx = size.w / canonical.w;
    const sy = size.h / canonical.h;

    const overlays = canvas.overlays.length
      ? canvas.overlays
      : (clip.editorProject?.elements ?? []).map((element) => {
          const props = (element.properties ?? {}) as Record<string, unknown>;
          return {
            id: element.id,
            type: (element.type as "text" | "caption" | "image") ?? "text",
            text: String(props.text ?? ""),
            x: element.x,
            y: element.y,
            scale: element.scale,
            fontSize: Number(props.fontSize) || 48,
            fontWeight: Number(props.fontWeight) || 700,
            color: String(props.color ?? "#ffffff"),
            background: typeof props.background === "string" ? props.background : null,
            alignment: (props.alignment as "left" | "center" | "right") ?? "center",
            startMs: element.startMs,
            endMs: element.endMs,
            storageKey: typeof props.storageKey === "string" ? props.storageKey : null,
            words: Array.isArray(props.words) ? (props.words as EditorOverlay["words"]) : undefined,
          };
        });

    const captionOverlays = overlays.filter((item) => item.type === "caption" && item.text.trim());
    const texts = overlays
      .filter((item) => item.type === "text" && item.text.trim())
      .map((item) => ({
        text: item.text,
        x: item.x * sx,
        y: item.y * sy,
        fontSize: item.fontSize * sy,
        fontWeight: item.fontWeight,
        color: item.color,
        background: item.background,
        alignment: item.alignment,
        startMs: Math.max(0, item.startMs - canvas.trimStartMs),
        endMs: Math.max(0, item.endMs - canvas.trimStartMs),
      }));

    const images = [];
    for (const item of overlays.filter((entry) => entry.type === "image" && entry.storageKey)) {
      const imagePath = await materializeObject(item.storageKey!, tmp, `overlay-${images.length}.bin`);
      images.push({
        path: imagePath,
        x: item.x * sx,
        y: item.y * sy,
        scale: item.scale,
        startMs: Math.max(0, item.startMs - canvas.trimStartMs),
        endMs: Math.max(0, item.endMs - canvas.trimStartMs),
      });
    }

    const captionStyle = (clip.editorProject?.captionStyle ?? {}) as { preset?: string; wordHighlight?: boolean };
    const preset = getCaptionPreset(captionStyle.preset ?? "Bold");
    let captionsForAss: CaptionCue[] = captionOverlays.map((item) => ({
      startMs: Math.max(0, item.startMs - canvas.trimStartMs),
      endMs: Math.max(0, item.endMs - canvas.trimStartMs),
      text: item.text,
      words: item.words?.map((word) => ({
        startMs: Math.max(0, word.startMs - canvas.trimStartMs),
        endMs: Math.max(0, word.endMs - canvas.trimStartMs),
        text: word.text,
      })),
    }));
    if (!captionsForAss.length && clip.project.transcript?.segments.length) {
      const windowSegments = clip.project.transcript.segments
        .filter((segment) => segment.endMs > clip.startMs && segment.startMs < clip.endMs)
        .map((segment) => ({
          startMs: Math.max(0, segment.startMs - clip.startMs),
          endMs: Math.min(clip.durationMs, segment.endMs - clip.startMs),
          text: segment.text,
          words: ((segment.words as Array<{ startMs: number; endMs: number; text: string }> | null) ?? []).map((word) => ({
            startMs: Math.max(0, word.startMs - clip.startMs),
            endMs: Math.min(clip.durationMs, word.endMs - clip.startMs),
            text: word.text,
          })),
        }));
      captionsForAss = formatCaptions(windowSegments, { maxWordsPerLine: preset.maxWordsPerLine, maxCharactersPerLine: 32, maxLines: 2 });
    }

    const outKey = randomStorageKey("render.mp4", `renders/${job.workspaceId}`);
    const outPath = await localOutputPath(outKey, tmp, "render.mp4");
    const durationMs = Math.max(200, canvas.trimEndMs - canvas.trimStartMs);
    const fontFile = defaultFontFile(texts.some((item) => item.fontWeight >= 700) ? 700 : 400);
    let assPath: string | null = null;
    if (captionsForAss.length) {
      const ass = buildAssDocument({
        width: size.w,
        height: size.h,
        cues: captionsForAss,
        style: preset,
        wordHighlight: captionStyle.wordHighlight ?? preset.wordHighlight,
      });
      assPath = await writeTempAssFile(tmpdir(), ass);
    }

    try {
    await renderEditedVideo({
      inputPath,
      outputPath: outPath,
      startMs: canvas.trimStartMs,
      durationMs,
      width: size.w,
      height: size.h,
      crop: canvas.crop,
      scale: canvas.scale,
      offsetX: canvas.offsetX * sx,
      offsetY: canvas.offsetY * sy,
      texts,
      images,
      fontFile,
      assPath,
      onProgress: (ratioDone) => {
        const progress = Math.min(95, 10 + Math.round(ratioDone * 80));
        void prisma.renderJob.update({ where: { id: job.id }, data: { progress } }).catch(() => undefined);
      },
    });
    } finally {
      await removeTempAssFile(assPath);
    }

    const probe = await probeVideo(outPath);
    await commitLocalFile(outPath, outKey, "video/mp4");
    const file = await getStorage().stat(outKey);
    await prisma.renderedAsset.create({
      data: {
        clipId: job.clipId,
        renderJobId: job.id,
        storageKey: outKey,
        mimeType: "video/mp4",
        sizeBytes: file.size,
      },
    });
    await prisma.renderJob.update({
      where: { id: job.id },
      data: { status: "DONE", progress: 100, finishedAt: new Date() },
    });
    await prisma.clip.update({
      where: { id: job.clipId },
      data: { status: "RENDERED" },
    });
    await prisma.processingJob.updateMany({
      where: { entityId: job.id, type: "RENDER" },
      data: {
        status: "COMPLETED",
        progress: 100,
        message: `Render real ${probe.width}x${probe.height} · ${file.size} bytes`,
        finishedAt: new Date(),
      },
    });
    await notifyWorkspace({
      workspaceId: job.workspaceId,
      type: "RENDER_READY",
      title: "Render pronto",
      body: `${job.clip.title} está pronto para download.`,
      entityType: "RenderJob",
      entityId: job.id,
    });
    });
  } catch (error) {
    await fail(error);
  }
}
