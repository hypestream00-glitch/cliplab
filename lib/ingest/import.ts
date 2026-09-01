import { createProject } from "@/lib/services/projects";
import { classifyIngestUrl } from "@/lib/ingest/classify";
import { IngestError, ingestErrorMessage } from "@/lib/ingest/errors";
import { previewIngestUrl, ingestPreviewDepsFromEnv } from "@/lib/ingest/preview";
import { getMediaImportProvider } from "@/lib/ingest/providers";
import { clampClipCount } from "@/lib/config/plans";
import { getMonthlyUsage, PlanLimitError } from "@/lib/billing/usage";
import { prisma } from "@/lib/db/prisma";
import type { ClipMode, ProjectStatus } from "@/generated/prisma/client";
import type { CLIP_DURATION_PRESETS } from "@/lib/config/app";
import type { OutputAspect } from "@/lib/config/output-aspect";

const ACTIVE_IMPORT_STATUSES: ProjectStatus[] = [
  "CREATED",
  "UPLOADING",
  "QUEUED",
  "PROCESSING",
  "PROBING",
  "AUDIO_EXTRACTING",
  "TRANSCRIBING",
  "ANALYZING",
  "GENERATING",
  "CLIPPING",
];

const inflightImports = new Map<string, Promise<{ id: string }>>();

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
  authorized: boolean;
};

export async function findActiveUrlImport(workspaceId: string, url: string) {
  return prisma.project.findFirst({
    where: {
      workspaceId,
      status: { in: ACTIVE_IMPORT_STATUSES },
      sourceVideo: { sourceUrl: url },
      createdAt: { gte: new Date(Date.now() - 15 * 60 * 1000) },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function importProjectFromUrl(input: ImportFromUrlInput) {
  if (!input.authorized) {
    throw new IngestError("Confirme a autorização de uso.", "invalid-url");
  }
  const classified = classifyIngestUrl(input.url);
  if (!classified) throw new IngestError(ingestErrorMessage("invalid-url"), "invalid-url");
  const provider = getMediaImportProvider(classified.provider);
  if (!classified.ingestSupported || !provider.canImport(classified)) {
    throw new IngestError(classified.reason ?? ingestErrorMessage("import-unavailable"), "import-unavailable");
  }

  const lockKey = `${input.workspaceId}:${classified.url}`;
  const existingInflight = inflightImports.get(lockKey);
  if (existingInflight) return existingInflight;

  const run = (async () => {
    const preview = await previewIngestUrl(classified.url, ingestPreviewDepsFromEnv());
    if (!preview.ingestSupported || !provider.canImport({ ...classified, ingestSupported: preview.ingestSupported, url: preview.url })) {
      throw new IngestError(preview.message ?? ingestErrorMessage("import-unavailable"), "import-unavailable");
    }
    const usage = await getMonthlyUsage(input.workspaceId);
    if (usage.remainingSeconds <= 0) {
      throw new PlanLimitError("Você atingiu o limite do seu plano.");
    }
    const clipCount = clampClipCount(usage.effectivePlanCode, input.clipCount);
    const name =
      (input.name ?? "").trim() && input.name !== "Novo projeto"
        ? input.name!.trim().slice(0, 80)
        : (preview.title ?? "Novo projeto").replace(/\.[^.]+$/, "").slice(0, 80) || "Novo projeto";
    const existing = await findActiveUrlImport(input.workspaceId, preview.url);
    if (existing) return existing;
    return createProject({
      workspaceId: input.workspaceId,
      name,
      sourceKind: classified.sourceKind,
      sourceUrl: preview.url,
      originalName: preview.title ?? name,
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
      authorized: true,
      sourceProvider: classified.provider,
      externalId: classified.externalId,
    });
  })().finally(() => {
    inflightImports.delete(lockKey);
  });

  inflightImports.set(lockKey, run);
  return run;
}

export async function previewProjectFromUrl(url: string) {
  return previewIngestUrl(url, ingestPreviewDepsFromEnv());
}

export function resetIngestImportLocks() {
  inflightImports.clear();
}

export { ACTIVE_IMPORT_STATUSES };
