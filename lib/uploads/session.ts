import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { getStorage } from "@/lib/storage";
import { logger } from "@/lib/logger";
import { createProject } from "@/lib/services/projects";
import { validateUploadFile, InvalidVideoError } from "@/lib/media/validate";
import { getPlanLimits, clampClipCount } from "@/lib/config/plans";
import { getMonthlyUsage, getWorkspacePlanCode, PlanLimitError } from "@/lib/billing/usage";
import { createProjectSchema } from "@/lib/validations";
import {
  DEFAULT_MAX_UPLOAD_BYTES,
  MAX_ACTIVE_UPLOAD_SESSIONS,
  SIGNED_PUT_TTL_SEC,
  canCleanupOrphanUpload,
  directObjectUploadEnabled,
  effectiveMaxUploadBytes,
  isUploadExpired,
  objectMatchesExpectedMime,
  objectMatchesExpectedSize,
  prismaIntSize,
  uploadObjectKey,
} from "@/lib/uploads/policy";
import { parseOutputAspect } from "@/lib/config/output-aspect";
import type { ClipMode } from "@/generated/prisma/client";

export const initUploadSchema = z.object({
  filename: z
    .string()
    .min(1)
    .max(255)
    .refine((value) => !value.includes("..") && !/[\\/]/.test(value), "Nome de arquivo inválido."),
  contentType: z.string().max(120).optional().default(""),
  fileSize: z.number().int().positive().max(DEFAULT_MAX_UPLOAD_BYTES),
});

export const completeUploadSchema = createProjectSchema;

export class UploadSessionError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
    this.name = "UploadSessionError";
  }
}

export async function initUploadSession(params: {
  workspaceId: string;
  userId: string;
  filename: string;
  contentType: string;
  fileSize: number;
}) {
  const planCode = await getWorkspacePlanCode(params.workspaceId);
  const limits = getPlanLimits(planCode);
  const maxBytes = effectiveMaxUploadBytes(limits.maxFileSizeBytes);
  const usage = await getMonthlyUsage(params.workspaceId);
  if (usage.remainingSeconds <= 0) {
    throw new PlanLimitError("Você atingiu o limite do seu plano.");
  }
  const validated = validateUploadFile({
    filename: params.filename,
    mimeType: params.contentType,
    sizeBytes: params.fileSize,
    maxBytes,
  });
  const active = await prisma.uploadSession.count({
    where: {
      workspaceId: params.workspaceId,
      status: { in: ["PENDING", "UPLOADING"] },
      expiresAt: { gt: new Date() },
    },
  });
  if (active >= MAX_ACTIVE_UPLOAD_SESSIONS) {
    throw new UploadSessionError("Há uploads em andamento demais neste workspace. Aguarde ou cancele um deles.", 429);
  }

  const session = await prisma.uploadSession.create({
    data: {
      workspaceId: params.workspaceId,
      userId: params.userId,
      storageKey: "pending",
      originalName: params.filename,
      expectedMime: validated.mime,
      expectedSize: BigInt(params.fileSize),
      status: "PENDING",
      expiresAt: new Date(Date.now() + SIGNED_PUT_TTL_SEC * 1000),
    },
  });
  const storageKey = uploadObjectKey(params.workspaceId, session.id, params.filename);
  await prisma.uploadSession.update({ where: { id: session.id }, data: { storageKey } });

  const storage = getStorage();
  const direct = directObjectUploadEnabled();
  const signed = direct
    ? await storage.getSignedUploadUrl(storageKey, SIGNED_PUT_TTL_SEC, validated.mime)
    : {
        url: `/api/uploads/${session.id}/put`,
        method: "PUT" as const,
        expiresAt: session.expiresAt,
        headers: { "Content-Type": validated.mime },
      };

    logger.info(
      {
        event: "uploads_started",
        uploadId: session.id,
        workspaceId: params.workspaceId,
        size: params.fileSize,
        mime: validated.mime,
        status: "PENDING",
        direct,
      },
      "upload.init",
    );

  return {
    uploadId: session.id,
    method: signed.method ?? "PUT",
    url: signed.url,
    headers: signed.headers ?? { "Content-Type": validated.mime },
    expiresAt: signed.expiresAt.toISOString(),
    maxBytes,
    directToObjectStorage: direct,
  };
}

export async function getOwnedUploadSession(workspaceId: string, uploadId: string) {
  const session = await prisma.uploadSession.findFirst({
    where: { id: uploadId, workspaceId },
  });
  if (!session) throw new UploadSessionError("Upload não encontrado.", 404);
  return session;
}

export async function completeUploadSession(params: {
  workspaceId: string;
  uploadId: string;
  project: z.infer<typeof completeUploadSchema>;
}) {
  const session = await getOwnedUploadSession(params.workspaceId, params.uploadId);
  if (session.projectId) {
    return { projectId: session.projectId, duplicate: true };
  }
  if (isUploadExpired(session.expiresAt) && session.status !== "VALIDATING") {
    await prisma.uploadSession.update({
      where: { id: session.id },
      data: { status: "EXPIRED", errorMessage: "Upload expirado." },
    });
    throw new UploadSessionError("O upload expirou. Envie o arquivo novamente.", 410);
  }

  const claimed = await prisma.uploadSession.updateMany({
    where: {
      id: session.id,
      workspaceId: params.workspaceId,
      projectId: null,
      status: { in: ["PENDING", "UPLOADING", "UPLOADED"] },
    },
    data: { status: "VALIDATING" },
  });
  if (claimed.count === 0) {
    const again = await getOwnedUploadSession(params.workspaceId, params.uploadId);
    if (again.projectId) return { projectId: again.projectId, duplicate: true };
    if (again.status === "FAILED") throw new UploadSessionError(again.errorMessage || "Upload inválido.", 400);
    throw new UploadSessionError("Este upload já está em validação.", 409);
  }

  const storage = getStorage();
  try {
    const exists = await storage.exists(session.storageKey);
    if (!exists) throw new InvalidVideoError("Arquivo ainda não chegou ao storage.");
    const info = await storage.stat(session.storageKey);
    const match = objectMatchesExpectedSize(session.expectedSize, info.size);
    if (!match.ok) {
      throw new InvalidVideoError(match.reason === "empty" ? "Arquivo vazio." : "Tamanho do arquivo não confere com o envio.");
    }
    const mime = objectMatchesExpectedMime(session.expectedMime, info.contentType);
    if (!mime.ok) {
      throw new InvalidVideoError("Tipo do arquivo no storage não confere com o envio.");
    }
    logger.info(
      {
        event: "bytes_uploaded",
        uploadId: session.id,
        workspaceId: params.workspaceId,
        size: Number(session.expectedSize),
        status: "UPLOADED",
      },
      "upload.validation",
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao verificar o arquivo.";
    await prisma.uploadSession.update({
      where: { id: session.id },
      data: { status: "FAILED", errorMessage: message },
    });
    logger.info(
      {
        event: "validation_failed",
        uploads_failed: 1,
        uploadId: session.id,
        workspaceId: params.workspaceId,
        status: "FAILED",
      },
      "upload.failed",
    );
    throw error instanceof InvalidVideoError ? error : new UploadSessionError(message, 400);
  }

  await prisma.uploadSession.update({
    where: { id: session.id },
    data: { status: "UPLOADED" },
  });

  const existingSource = await prisma.sourceVideo.findFirst({
    where: { storageKey: session.storageKey, project: { workspaceId: params.workspaceId } },
    select: { projectId: true },
  });
  if (existingSource) {
    await prisma.uploadSession.update({
      where: { id: session.id },
      data: { status: "COMPLETED", projectId: existingSource.projectId, errorMessage: null },
    });
    return { projectId: existingSource.projectId, duplicate: true };
  }

  const planCode = await getWorkspacePlanCode(params.workspaceId);
  const clipCount = clampClipCount(planCode, params.project.clipCount);
  try {
    const project = await createProject({
      workspaceId: params.workspaceId,
      name: params.project.name,
      sourceKind: "UPLOAD",
      originalName: session.originalName,
      storageKey: session.storageKey,
      mimeType: session.expectedMime,
      sizeBytes: prismaIntSize(session.expectedSize),
      language: params.project.language,
      intervalSeconds: params.project.intervalSeconds,
      clipDuration: params.project.clipDuration,
      clipCount,
      mode: params.project.mode as ClipMode,
      detectSpeakers: params.project.detectSpeakers,
      removeSilences: params.project.removeSilences,
      autoReframe: params.project.autoReframe,
      autoCaptions: params.project.autoCaptions,
      viralScore: params.project.viralScore,
      generateTitle: params.project.generateTitle,
      generateDescription: params.project.generateDescription,
      generateHashtags: params.project.generateHashtags,
      outputAspect: parseOutputAspect(params.project.outputAspect),
    });

    await prisma.uploadSession.update({
      where: { id: session.id },
      data: { status: "COMPLETED", projectId: project.id, errorMessage: null },
    });

    logger.info(
      {
        event: "uploads_completed",
        uploadId: session.id,
        workspaceId: params.workspaceId,
        projectId: project.id,
        size: Number(session.expectedSize),
        status: "COMPLETED",
      },
      "upload.complete",
    );

    return { projectId: project.id, duplicate: false };
  } catch (error) {
    await prisma.uploadSession.update({
      where: { id: session.id },
      data: { status: "UPLOADED", errorMessage: error instanceof Error ? error.message.slice(0, 180) : "Falha ao criar projeto." },
    }).catch(() => undefined);
    throw error;
  }
}

export async function abortUploadSession(workspaceId: string, uploadId: string) {
  const session = await getOwnedUploadSession(workspaceId, uploadId);
  if (session.projectId) return session;
  if (session.storageKey && session.storageKey !== "pending") {
    try {
      await getStorage().deleteObject(session.storageKey);
    } catch {
      /* best-effort: object may not exist yet */
    }
  }
  await prisma.uploadSession.update({
    where: { id: session.id },
    data: { status: "EXPIRED", errorMessage: "Cancelado pelo usuário." },
  });
  return session;
}

export async function cleanupExpiredUploads(limit = 20) {
  const now = new Date();
  const rows = await prisma.uploadSession.findMany({
    where: {
      projectId: null,
      expiresAt: { lte: now },
      status: { in: ["PENDING", "UPLOADING", "UPLOADED", "FAILED", "EXPIRED", "VALIDATING"] },
    },
    take: limit,
    orderBy: { expiresAt: "asc" },
  });
  const storage = getStorage();
  let removed = 0;
  for (const row of rows) {
    if (!canCleanupOrphanUpload(row)) continue;
    try {
      if (row.storageKey && row.storageKey !== "pending") {
        await storage.deleteObject(row.storageKey);
      }
    } catch {
      /* best-effort object delete */
    }
    await prisma.uploadSession.update({
      where: { id: row.id },
      data: { status: "EXPIRED", errorMessage: row.errorMessage ?? "Expirado." },
    });
    removed += 1;
  }
  if (removed) logger.info({ event: "uploads_expired_cleanup", removed }, "upload.cleanup");
  return removed;
}
