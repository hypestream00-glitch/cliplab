import { prisma } from "@/lib/db/prisma";
import { enqueue } from "@/lib/queue";
import { CLIP_DURATION_PRESETS } from "@/lib/config/app";
import { parseOutputAspect, type OutputAspect } from "@/lib/config/output-aspect";
import { randomStorageKey } from "@/lib/storage";
import { putUploadStream } from "@/lib/storage/materialize";
import { toDbJobStatus } from "@/lib/jobs/status";
import { InvalidVideoError } from "@/lib/media/validate";
import type { ClipMode, SourceKind } from "@/generated/prisma/client";

export class UrlIngestNotSupportedError extends Error {
  constructor() {
    super("O processamento real exige upload de MP4, MOV ou WEBM. Ingestão por URL ainda não baixa o arquivo.");
    this.name = "UrlIngestNotSupportedError";
  }
}

export async function createProject(params: {
  workspaceId: string;
  name: string;
  sourceKind: SourceKind;
  sourceUrl?: string;
  originalName?: string;
  storageKey?: string;
  mimeType?: string;
  sizeBytes?: number;
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
  authorized?: boolean;
  sourceProvider?: string;
  externalId?: string;
}) {
  if (params.sourceKind === "UPLOAD" && !params.storageKey) {
    throw new InvalidVideoError("Selecione um arquivo de vídeo.");
  }
  if (params.sourceKind !== "UPLOAD") {
    if (params.sourceUrl) {
      const { assertSafeIngestUrl } = await import("@/lib/security/ssrf");
      assertSafeIngestUrl(params.sourceUrl);
    }
    const pendingDirectImport = params.sourceKind === "DIRECT_URL" && Boolean(params.sourceUrl) && !params.storageKey;
    if (!params.storageKey && !pendingDirectImport) {
      throw new UrlIngestNotSupportedError();
    }
  }
  const { assertWorkspaceJobQuota } = await import("@/lib/billing/usage");
  await assertWorkspaceJobQuota(params.workspaceId, "generation");
  const duration = CLIP_DURATION_PRESETS[params.clipDuration];
  const project = await prisma.project.create({
    data: {
      workspaceId: params.workspaceId,
      name: params.name,
      status: "QUEUED",
      language: params.language,
      intervalSeconds: params.intervalSeconds,
      clipDurationMin: duration.min,
      clipDurationMax: duration.max,
      clipCount: params.clipCount,
      mode: params.mode,
      detectSpeakers: params.detectSpeakers,
      removeSilences: params.removeSilences,
      autoReframe: params.autoReframe,
      autoCaptions: params.autoCaptions,
      viralScore: params.viralScore,
      generateTitle: params.generateTitle,
      generateDescription: params.generateDescription,
      generateHashtags: params.generateHashtags,
      authorized: params.authorized !== false,
      creditsUsed: 0,
      pipelineMeta: {
        video: "pending",
        transcription: "pending",
        analysis: "pending",
        render: "pending",
        targetAspect: parseOutputAspect(params.outputAspect),
        ingest: params.storageKey ? "ready" : "queued",
        ...(params.sourceKind !== "UPLOAD"
          ? {
              sourceType: "URL",
              sourceProvider: params.sourceProvider ?? params.sourceKind,
              externalId: params.externalId ?? null,
              rightsConfirmedAt: params.authorized !== false ? new Date().toISOString() : null,
            }
          : {}),
      },
      sourceVideo: {
        create: {
          kind: params.sourceKind,
          sourceUrl: params.sourceUrl,
          originalName: params.originalName ?? params.name,
          storageKey: params.storageKey,
          mimeType: params.mimeType,
          sizeBytes: params.sizeBytes,
        },
      },
    },
  });

  const job = await prisma.processingJob.create({
    data: {
      workspaceId: params.workspaceId,
      projectId: project.id,
      type: "VIDEO_IMPORT",
      entityId: project.id,
      status: toDbJobStatus("QUEUED"),
      progress: 0,
      message: "Processando vídeo",
    },
  });

  await enqueue("video-import", {
    jobId: job.id,
    workspaceId: params.workspaceId,
    entityId: project.id,
    type: "video-import",
  });

  return project;
}

export async function storeUploadFile(params: {
  workspaceId: string;
  filename: string;
  mimeType: string;
  stream: NodeJS.ReadableStream;
}) {
  const key = randomStorageKey(params.filename, `uploads/${params.workspaceId}`);
  await putUploadStream(key, params.stream, params.mimeType);
  return key;
}
