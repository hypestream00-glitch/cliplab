import { notFound } from "next/navigation";
import { requireWorkspaceContext } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { EditorWorkspace } from "@/components/editor/editor-workspace";
import { labelFromAspectRatio } from "@/lib/services/editor";
import { parseCanvas, type EditorOverlay } from "@/lib/editor/state";
import { getProcessingCapabilities } from "@/lib/media/capabilities";
import { mediaUrl } from "@/lib/storage/url";
import { formatCaptions } from "@/lib/captions/format";
import { captionY, getCaptionPreset } from "@/lib/captions/presets";
import { canvasSize } from "@/lib/editor/state";
import type { PageParamsProps } from "@/types/routes";
import { visibleClipWhere } from "@/lib/data/visibility";
import { getPlanLimits } from "@/lib/config/plans";
import { getWorkspacePlanCode } from "@/lib/billing/usage";

export default async function EditorPage({ params }: PageParamsProps<{ clipId: string }>) {
  const { workspace } = await requireWorkspaceContext();
  const { clipId } = await params;
  const [clip, templates, capabilities, planCode] = await Promise.all([
    prisma.clip.findFirst({
      where: { id: clipId, ...visibleClipWhere(workspace.id) },
      include: {
        editorProject: { include: { elements: { orderBy: { layer: "asc" } } } },
        project: { include: { transcript: { include: { segments: { orderBy: { startMs: "asc" } } } } } },
      },
    }),
    prisma.template.findMany({ where: { workspaceId: workspace.id }, orderBy: { name: "asc" } }),
    getProcessingCapabilities(),
    getWorkspacePlanCode(workspace.id),
  ]);
  if (!clip) notFound();
  const style = (clip.editorProject?.captionStyle ?? {}) as { preset?: string };
  const preset = getCaptionPreset(style.preset ?? "Bold");
  const canvas = parseCanvas(clip.editorProject?.canvasJson, clip.durationMs);
  const size = canvasSize(clip.editorProject ? labelFromAspectRatio(clip.editorProject.aspectRatio) : "9:16");
  const windowSegments = (clip.project.transcript?.segments ?? [])
    .filter((segment) => segment.endMs > clip.startMs && segment.startMs < clip.endMs)
    .map((segment) => ({
      startMs: segment.startMs,
      endMs: segment.endMs,
      text: segment.text,
      words: (segment.words as Array<{ startMs: number; endMs: number; text: string }> | null) ?? undefined,
    }));
  const captionsFromTranscript: EditorOverlay[] =
    canvas.overlays.length === 0
      ? formatCaptions(windowSegments, {
          maxWordsPerLine: preset.maxWordsPerLine,
          maxCharactersPerLine: 32,
          maxLines: 2,
        }).map((cue, index) => ({
          id: `cap-${clip.id}-${index}`,
          type: "caption" as const,
          text: cue.text,
          x: 80,
          y: captionY(preset.position, size.h),
          scale: 1,
          fontSize: preset.fontSize,
          fontWeight: preset.fontWeight,
          color: preset.color,
          background: preset.background,
          alignment: preset.alignment,
          startMs: Math.max(0, cue.startMs - clip.startMs),
          endMs: Math.min(clip.durationMs, cue.endMs - clip.startMs),
          words: cue.words?.map((word) => ({
            startMs: Math.max(0, word.startMs - clip.startMs),
            endMs: Math.min(clip.durationMs, word.endMs - clip.startMs),
            text: word.text,
          })),
        })).filter((item) => item.endMs > item.startMs)
      : [];
  return (
    <EditorWorkspace
      clipId={clip.id}
      title={clip.title}
      caption={clip.suggestedCaption ?? clip.description ?? ""}
      hashtags={clip.hashtags}
      durationMs={clip.durationMs}
      videoSrc={mediaUrl(clip.storageKey)}
      poster={mediaUrl(clip.thumbnailKey)}
      initialRatio={clip.editorProject ? labelFromAspectRatio(clip.editorProject.aspectRatio) : "9:16"}
      initialCaptionPreset={style.preset ?? "Bold"}
      initialCanvas={canvas}
      captionsFromTranscript={captionsFromTranscript}
      templates={templates.map((item) => ({ id: item.id, name: item.name }))}
      appliedTemplateId={clip.editorProject?.templateId ?? null}
      capabilities={capabilities}
      maxResolution={getPlanLimits(planCode).maxResolution === "720p" ? "720p" : "1080p"}
    />
  );
}
