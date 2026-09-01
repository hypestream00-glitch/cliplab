import { createProject } from "@/lib/services/projects";
import { classifyIngestUrl } from "@/lib/ingest/classify";
import { downloadDirectVideoToStorage } from "@/lib/ingest/download";
import { IngestError, ingestErrorMessage } from "@/lib/ingest/errors";
import { previewIngestUrl, ingestPreviewDepsFromEnv } from "@/lib/ingest/preview";
import { clampClipCount, getPlanLimits } from "@/lib/config/plans";
import { getMonthlyUsage, PlanLimitError } from "@/lib/billing/usage";
import { FFmpegUnavailableError, isFfmpegAvailable } from "@/lib/ffmpeg";
import type { ClipMode } from "@/generated/prisma/client";
import type { CLIP_DURATION_PRESETS } from "@/lib/config/app";
import type { OutputAspect } from "@/lib/config/output-aspect";

export type ImportFromUrlInput = {
  workspaceId: string;
  url: string;
  name?: string;
  language: string;
  intervalSeconds: number;
  clipDuration: keyof typeof CLIP_DURATION_PRESETS;
  clipCount: number;
  mode: ClipMode;
  detectSpeakers: boolean;
  removeSilences: boolean;
  autoReframe: boolean;
  autoCaptions: boolean;
  viralScore: boolean;
  generateTitle: boolean;
  generateDescription: boolean;
  generateHashtags: boolean;
  outputAspect?: OutputAspect;
  maxBytes?: number;
};

export async function importProjectFromUrl(input: ImportFromUrlInput) {
  if (!(await isFfmpegAvailable())) throw new FFmpegUnavailableError();
  const classified = classifyIngestUrl(input.url);
  if (!classified) throw new IngestError(ingestErrorMessage("invalid-url"), "invalid-url");
  if (!classified.ingestSupported) {
    throw new IngestError(ingestErrorMessage("unsupported"), "unsupported");
  }
  const usage = await getMonthlyUsage(input.workspaceId);
  if (usage.remainingSeconds <= 0) {
    throw new PlanLimitError("Você atingiu o limite do seu plano.");
  }
  const limits = getPlanLimits(usage.effectivePlanCode);
  const maxBytes = Math.min(input.maxBytes ?? limits.maxFileSizeBytes, limits.maxFileSizeBytes);
  const downloaded = await downloadDirectVideoToStorage({
    workspaceId: input.workspaceId,
    url: classified.url,
    maxBytes,
  });
  const clipCount = clampClipCount(usage.effectivePlanCode, input.clipCount);
  const name =
    (input.name ?? "").trim() && input.name !== "Novo projeto"
      ? input.name!.trim().slice(0, 80)
      : downloaded.filename.replace(/\.[^.]+$/, "").slice(0, 80) || "Novo projeto";
  return createProject({
    workspaceId: input.workspaceId,
    name,
    sourceKind: classified.sourceKind,
    sourceUrl: downloaded.finalUrl,
    originalName: downloaded.filename,
    storageKey: downloaded.storageKey,
    mimeType: downloaded.mimeType,
    sizeBytes: downloaded.sizeBytes,
    language: input.language,
    intervalSeconds: input.intervalSeconds,
    clipDuration: input.clipDuration,
    clipCount,
    mode: input.mode,
    detectSpeakers: input.detectSpeakers,
    removeSilences: input.removeSilences,
    autoReframe: input.autoReframe,
    autoCaptions: input.autoCaptions,
    viralScore: input.viralScore,
    generateTitle: input.generateTitle,
    generateDescription: input.generateDescription,
    generateHashtags: input.generateHashtags,
    outputAspect: input.outputAspect,
  });
}

export async function previewProjectFromUrl(url: string) {
  return previewIngestUrl(url, ingestPreviewDepsFromEnv());
}
