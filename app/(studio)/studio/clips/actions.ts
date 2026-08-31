"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireWorkspaceContext } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { archiveClip, deleteClip, duplicateClip } from "@/lib/services/clips";
import { enqueueRender } from "@/lib/services/renders";
import { rateLimitGuard } from "@/lib/security/guard";
import { enqueueBulkDownload } from "@/lib/services/bulk-download";
import { FFmpegUnavailableError } from "@/lib/ffmpeg";
import { regenerateClipSuggestions } from "@/lib/services/clip-detection";
import { clampExportResolution } from "@/lib/config/plans";
import { getWorkspacePlanCode, PlanLimitError } from "@/lib/billing/usage";

export async function deleteClipAction(formData: FormData) {
  const ctx = await requireWorkspaceContext();
  await deleteClip(ctx.workspace.id, String(formData.get("clipId") ?? ""));
  revalidatePath("/studio/clips");
  redirect("/studio/clips");
}

export async function archiveClipAction(formData: FormData) {
  const ctx = await requireWorkspaceContext();
  await archiveClip(ctx.workspace.id, String(formData.get("clipId") ?? ""));
  revalidatePath("/studio/clips");
  redirect("/studio/clips");
}

export async function duplicateClipAction(formData: FormData) {
  const ctx = await requireWorkspaceContext();
  const copy = await duplicateClip(ctx.workspace.id, String(formData.get("clipId") ?? ""));
  revalidatePath("/studio/clips");
  if (copy) redirect(`/studio/clips/${copy.id}`);
  redirect("/studio/clips");
}

export async function renderClipAction(formData: FormData) {
  const limited = await rateLimitGuard("render", 8, 60_000);
  if (limited) {
    const clipId = String(formData.get("clipId") ?? "");
    redirect(`/studio/clips/${clipId}?notice=rate-limit`);
  }
  const ctx = await requireWorkspaceContext();
  const clipId = String(formData.get("clipId") ?? "");
  const requested = formData.get("resolution") === "720p" ? "720p" : "1080p";
  const planCode = await getWorkspacePlanCode(ctx.workspace.id);
  const resolution = clampExportResolution(planCode, requested);
  try {
    await enqueueRender(ctx.workspace.id, clipId, resolution);
  } catch (error) {
    if (error instanceof PlanLimitError) {
      redirect(`/studio/clips/${clipId}?notice=plan-limit`);
    }
    if (error instanceof FFmpegUnavailableError) {
      redirect(`/studio/clips/${clipId}?notice=ffmpeg-missing`);
    }
    throw error;
  }
  revalidatePath(`/studio/clips/${clipId}`);
  revalidatePath(`/studio/editor/${clipId}`);
  redirect(`/studio/clips/${clipId}?notice=rendering`);
}

export async function downloadClipAction(formData: FormData) {
  const ctx = await requireWorkspaceContext();
  const clipId = String(formData.get("clipId") ?? "");
  const clip = await prisma.clip.findFirst({
    where: { id: clipId, workspaceId: ctx.workspace.id },
    include: {
      renderedAssets: { orderBy: { createdAt: "desc" }, take: 1 },
      renderJobs: { where: { status: "DONE" }, orderBy: { createdAt: "desc" }, take: 1, include: { assets: true } },
    },
  });
  if (!clip) redirect("/studio/clips");
  const rendered = clip.renderJobs[0]?.assets[0] ?? clip.renderedAssets[0];
  const key = rendered?.storageKey ?? clip.storageKey;
  if (!key) {
    redirect(`/studio/clips/${clipId}?notice=no-file`);
  }
  const name = `${clip.title.replace(/[^\w\-]+/g, "_").slice(0, 40) || "clip"}.mp4`;
  redirect(`/api/media?key=${encodeURIComponent(key)}&download=1&filename=${encodeURIComponent(name)}`);
}

export async function bulkDownloadAction(formData: FormData) {
  const ctx = await requireWorkspaceContext();
  const ids = formData.getAll("clipIds").map(String).filter(Boolean);
  if (ids.length === 0) redirect("/studio/clips?notice=no-selection");
  const job = await enqueueBulkDownload(ctx.workspace.id, ids);
  revalidatePath("/studio/clips");
  redirect(`/studio/clips?bulk=${job.id}`);
}

export async function updateClipCopyAction(formData: FormData) {
  const ctx = await requireWorkspaceContext();
  const clipId = String(formData.get("clipId") ?? "");
  const clip = await prisma.clip.findFirst({ where: { id: clipId, workspaceId: ctx.workspace.id } });
  if (!clip) return;
  const hashtags = String(formData.get("hashtags") ?? "")
    .split(/[\s,]+/)
    .map((tag) => tag.replace(/^#/, "").trim())
    .filter(Boolean)
    .slice(0, 12);
  await prisma.clip.update({
    where: { id: clip.id },
    data: {
      title: String(formData.get("title") ?? clip.title).slice(0, 120) || clip.title,
      suggestedCaption: String(formData.get("caption") ?? ""),
      description: String(formData.get("caption") ?? clip.description ?? ""),
      reason: String(formData.get("reason") ?? clip.reason ?? ""),
      hashtags,
    },
  });
  revalidatePath(`/studio/clips/${clip.id}`);
}

export async function regenerateSuggestionsAction(clipId: string) {
  const ctx = await requireWorkspaceContext();
  if (!process.env.OPENAI_API_KEY?.trim()) {
    return { error: "OPENAI_API_KEY ausente." };
  }
  const clip = await prisma.clip.findFirst({
    where: { id: clipId, workspaceId: ctx.workspace.id },
    include: { score: true, project: { include: { transcript: { include: { segments: true } }, sourceVideo: true } } },
  });
  if (!clip) return { error: "Clip não encontrado." };
  try {
    const suggestion = await regenerateClipSuggestions({
      language: clip.project.language,
      durationMs: clip.project.sourceVideo?.durationMs ?? Math.max(clip.endMs, clip.durationMs),
      startMs: clip.startMs,
      endMs: clip.endMs,
      segments: (clip.project.transcript?.segments ?? []).map((segment) => ({
        startMs: segment.startMs,
        endMs: segment.endMs,
        text: segment.text,
        speakerId: segment.speakerId ?? undefined,
      })),
      mode: clip.project.mode,
    });
    if (!suggestion) return { error: "A IA não retornou uma sugestão válida." };
    await prisma.clip.update({
      where: { id: clip.id },
      data: {
        title: suggestion.title,
        summary: suggestion.summary,
        reason: suggestion.reason,
        suggestedCaption: suggestion.suggestedCaption,
        description: suggestion.suggestedCaption || suggestion.summary,
        hashtags: suggestion.suggestedHashtags,
      },
    });
    if (clip.score) {
      await prisma.clipScore.update({
        where: { clipId: clip.id },
        data: {
          overall: suggestion.score,
          hookScore: suggestion.hookScore,
          retentionScore: suggestion.retentionScore,
          clarityScore: suggestion.clarityScore,
          emotionScore: suggestion.emotionScore,
          shareabilityScore: suggestion.shareabilityScore,
        },
      });
    }
    revalidatePath(`/studio/clips/${clip.id}`);
    return { ok: true as const };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Falha ao regenerar." };
  }
}
