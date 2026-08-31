import { prisma } from "@/lib/db/prisma";
import type { AspectRatio, Prisma } from "@/generated/prisma/client";
import type { EditorCanvasState, EditorOverlay } from "@/lib/editor/state";
import { parseCanvas } from "@/lib/editor/state";

const RATIO_MAP: Record<string, AspectRatio> = {
  "9:16": "NINE_SIXTEEN",
  "16:9": "SIXTEEN_NINE",
  "1:1": "ONE_ONE",
  "4:5": "FOUR_FIVE",
};

export function aspectRatioFromLabel(ratio: string): AspectRatio {
  return RATIO_MAP[ratio] ?? "NINE_SIXTEEN";
}

export function labelFromAspectRatio(ratio: AspectRatio) {
  const entry = Object.entries(RATIO_MAP).find(([, value]) => value === ratio);
  return entry?.[0] ?? "9:16";
}

export async function saveEditorProject(params: {
  workspaceId: string;
  clipId: string;
  aspectRatio: string;
  captionPreset: string;
  captionStyle: Record<string, unknown>;
  canvas: EditorCanvasState | Record<string, unknown>;
  templateId?: string | null;
  createRevision?: boolean;
  title?: string;
  suggestedCaption?: string;
  hashtags?: string[];
}) {
  const clip = await prisma.clip.findFirst({
    where: { id: params.clipId, workspaceId: params.workspaceId },
  });
  if (!clip) throw new Error("Clip não encontrado");
  const canvas = parseCanvas(params.canvas, clip.durationMs);
  if (params.title || params.suggestedCaption != null || params.hashtags) {
    await prisma.clip.update({
      where: { id: clip.id },
      data: {
        ...(params.title?.trim() ? { title: params.title.trim().slice(0, 120) } : {}),
        ...(params.suggestedCaption != null
          ? { suggestedCaption: params.suggestedCaption, description: params.suggestedCaption }
          : {}),
        ...(params.hashtags
          ? { hashtags: params.hashtags.map((tag) => tag.replace(/^#/, "").trim()).filter(Boolean).slice(0, 12) }
          : {}),
      },
    });
  }
  const project = await prisma.editorProject.upsert({
    where: { clipId: clip.id },
    create: {
      workspaceId: params.workspaceId,
      clipId: clip.id,
      aspectRatio: aspectRatioFromLabel(params.aspectRatio),
      canvasJson: canvas as unknown as Prisma.InputJsonValue,
      captionStyle: { preset: params.captionPreset, ...params.captionStyle } as Prisma.InputJsonValue,
      templateId: params.templateId ?? undefined,
    },
    update: {
      aspectRatio: aspectRatioFromLabel(params.aspectRatio),
      canvasJson: canvas as unknown as Prisma.InputJsonValue,
      captionStyle: { preset: params.captionPreset, ...params.captionStyle } as Prisma.InputJsonValue,
      templateId: params.templateId ?? undefined,
    },
  });
  await prisma.editorElement.deleteMany({ where: { editorProjectId: project.id } });
  if (canvas.overlays.length) {
    await prisma.editorElement.createMany({
      data: canvas.overlays.map((overlay: EditorOverlay, index) => ({
        editorProjectId: project.id,
        type: overlay.type,
        layer: index,
        x: overlay.x,
        y: overlay.y,
        scale: overlay.scale,
        startMs: overlay.startMs,
        endMs: overlay.endMs,
        properties: {
          text: overlay.text,
          fontSize: overlay.fontSize,
          fontWeight: overlay.fontWeight,
          color: overlay.color,
          background: overlay.background,
          alignment: overlay.alignment,
          storageKey: overlay.storageKey ?? null,
          words: overlay.words ?? null,
        } as Prisma.InputJsonValue,
      })),
    });
  }
  if (params.createRevision) {
    await prisma.editorRevision.create({
      data: {
        editorProjectId: project.id,
        snapshot: {
          aspectRatio: params.aspectRatio,
          captionPreset: params.captionPreset,
          captionStyle: params.captionStyle,
          canvas,
        } as Prisma.InputJsonValue,
      },
    });
  }
  return project;
}
