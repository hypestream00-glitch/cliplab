import { prisma } from "@/lib/db/prisma";
import { getStorage } from "@/lib/storage";
import { probeVideo } from "@/lib/ffmpeg";
import { getSocialProvider } from "@/lib/social";
import { getUsableAccessToken } from "@/lib/services/social-accounts";
import { PLATFORM_LIMITS } from "@/lib/social/platform-limits";
import { TikTokApiError } from "@/lib/social/tiktok/http";
import { composeTikTokTitle } from "@/lib/social/tiktok/caption";
import { logger } from "@/lib/logger";
import type { SocialPublicationTarget, SocialAccount } from "@/generated/prisma/client";

const LIMITS = PLATFORM_LIMITS.TIKTOK;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export { composeTikTokTitle };

export function validateTikTokMedia(probe: {
  durationMs: number;
  width: number | null;
  height: number | null;
  fps: number | null;
  size: number;
  maxDurationSec: number;
}) {
  if (probe.size <= 0) throw new TikTokApiError("Arquivo de vídeo vazio.", "invalid_video", 400, false);
  if (probe.size > LIMITS.maxFileBytes) throw new TikTokApiError("Vídeo excede 4 GB.", "invalid_video", 400, false);
  if (probe.width && probe.width < LIMITS.minWidth) throw new TikTokApiError("Largura mínima do TikTok é 360 px.", "invalid_video", 400, false);
  if (probe.height && probe.height < LIMITS.minHeight) throw new TikTokApiError("Altura mínima do TikTok é 360 px.", "invalid_video", 400, false);
  if (probe.width && probe.width > LIMITS.maxWidth) throw new TikTokApiError("Largura máxima do TikTok é 4096 px.", "invalid_video", 400, false);
  if (probe.fps && (probe.fps < LIMITS.minFps || probe.fps > LIMITS.maxFps)) {
    throw new TikTokApiError("FPS do TikTok deve estar entre 23 e 60.", "invalid_video", 400, false);
  }
  if (probe.durationMs / 1000 > probe.maxDurationSec) {
    throw new TikTokApiError(`Este criador aceita no máximo ${probe.maxDurationSec}s.`, "duration_check_failed", 400, false);
  }
}

export async function resolvePublishFile(clipId: string, workspaceId: string) {
  const clip = await prisma.clip.findFirst({
    where: { id: clipId, workspaceId },
    include: {
      renderedAssets: { orderBy: { createdAt: "desc" }, take: 1 },
      renderJobs: { where: { status: "DONE" }, orderBy: { createdAt: "desc" }, take: 1, include: { assets: true } },
    },
  });
  if (!clip) throw new Error("Clip não encontrado");
  const key = clip.renderJobs[0]?.assets[0]?.storageKey ?? clip.renderedAssets[0]?.storageKey ?? clip.storageKey;
  if (!key) throw new TikTokApiError("Gere o render final ou reprocesse o clipe antes de publicar.", "invalid_video", 400, false);
  const abs = getStorage().getAbsolutePath(key);
  if (!abs) throw new TikTokApiError("Publicação TikTok exige o arquivo no storage local.", "invalid_video", 400, false);
  const file = await getStorage().stat(key);
  const probe = await probeVideo(abs);
  return { clip, abs, size: file.size, probe };
}

export async function publishTikTokTarget(params: {
  workspaceId: string;
  userId?: string;
  publicationId: string;
  target: SocialPublicationTarget & { socialAccount: SocialAccount };
  clipId: string;
  caption: string;
  hashtags: string[];
  onProgress?: (progress: number, message: string) => Promise<void>;
}) {
  const { target } = params;
  const idempotencyKey = `tiktok:${target.id}:${params.clipId}:${target.socialAccountId}`;
  if (target.idempotencyKey && target.externalPublishId && target.status !== "FAILED") {
    return pollUntilDone(target, params.onProgress);
  }

  const claimed = await prisma.socialPublicationTarget.updateMany({
    where: {
      id: target.id,
      status: { in: ["QUEUED", "FAILED", "SCHEDULED", "DRAFT"] },
    },
    data: { status: "UPLOADING", idempotencyKey, errorMessage: null, failureCode: null },
  });
  if (claimed.count === 0 && target.externalPublishId) {
    return pollUntilDone(target, params.onProgress);
  }
  if (claimed.count === 0) {
    logger.info({ targetId: target.id }, "tiktok publish already in flight");
    return;
  }

  const provider = getSocialProvider("TIKTOK");
  const token = await getUsableAccessToken(target.socialAccount);
  const creator = await provider.getCreatorInfo?.(token);
  if (!creator) throw new TikTokApiError("Não foi possível obter creator info.", "scope_not_authorized", 401, false);

  const options = (target.platformOptions ?? {}) as {
    privacy?: string;
    disableComment?: boolean;
    disableDuet?: boolean;
    disableStitch?: boolean;
  };
  const privacy = options.privacy ?? creator.privacyLevelOptions[0];
  if (!privacy || !creator.privacyLevelOptions.includes(privacy)) {
    throw new TikTokApiError("Opção de privacidade inválida para este criador.", "privacy_level_option_mismatch", 400, false);
  }
  if (!target.socialAccount.scopes.includes("video.publish")) {
    throw new TikTokApiError("A conta não concedeu video.publish. Reconecte e aceite o escopo.", "scope_not_authorized", 401, false);
  }

  const file = await resolvePublishFile(params.clipId, params.workspaceId);
  validateTikTokMedia({
    durationMs: file.probe.durationMs,
    width: file.probe.width,
    height: file.probe.height,
    fps: file.probe.fps,
    size: file.size,
    maxDurationSec: creator.maxVideoPostDurationSec || LIMITS.defaultMaxDurationSec,
  });

  await params.onProgress?.(20, "Inicializando publicação TikTok");
  await prisma.auditLog.create({
    data: {
      userId: params.userId,
      workspaceId: params.workspaceId,
      action: "TIKTOK_PUBLISH_STARTED",
      entityType: "SocialPublication",
      entityId: params.publicationId,
      metadata: { targetId: target.id, privacy },
    },
  });

  const result = await provider.publishVideo({
    accessToken: token,
    videoPath: file.abs,
    videoSize: file.size,
    title: composeTikTokTitle(params.caption, params.hashtags),
    privacyLevel: privacy,
    disableComment: creator.commentDisabled ? true : Boolean(options.disableComment),
    disableDuet: creator.duetDisabled ? true : Boolean(options.disableDuet),
    disableStitch: creator.stitchDisabled ? true : Boolean(options.disableStitch),
    coverTimestampMs: 1000,
    onProgress: (ratio) => {
      void params.onProgress?.(20 + Math.round(ratio * 50), "Enviando vídeo ao TikTok");
    },
  });

  await prisma.socialPublicationTarget.update({
    where: { id: target.id },
    data: {
      status: "PROCESSING",
      externalPublishId: result.publishId,
      privacy,
      idempotencyKey,
    },
  });

  const latest = await prisma.socialPublicationTarget.findUniqueOrThrow({
    where: { id: target.id },
    include: { socialAccount: true },
  });
  await pollUntilDone(latest, params.onProgress);
}

async function pollUntilDone(
  target: SocialPublicationTarget & { socialAccount: SocialAccount },
  onProgress?: (progress: number, message: string) => Promise<void>,
) {
  if (!target.externalPublishId) return;
  const provider = getSocialProvider("TIKTOK");
  const token = await getUsableAccessToken(target.socialAccount);
  const deadline = Date.now() + 12 * 60 * 1000;
  let delay = 4000;
  while (Date.now() < deadline) {
    const status = await provider.getPostStatus({ accessToken: token, publishId: target.externalPublishId });
    await onProgress?.(Math.min(95, 75), `TikTok: ${status.status}`);
    if (status.status === "PUBLISHED") {
      const postId = status.postIds?.[0] ?? target.externalPublishId;
      await prisma.socialPublicationTarget.update({
        where: { id: target.id },
        data: {
          status: "PUBLISHED",
          externalPostId: postId,
          publishedAt: new Date(),
          errorMessage: null,
          failureCode: null,
        },
      });
      await prisma.auditLog.create({
        data: {
          workspaceId: target.socialAccount.workspaceId,
          action: "TIKTOK_PUBLISHED",
          entityType: "SocialPublicationTarget",
          entityId: target.id,
          metadata: { postId },
        },
      });
      return;
    }
    if (status.status === "FAILED") {
      const message = status.failReason ?? "Publicação TikTok falhou.";
      await prisma.socialPublicationTarget.update({
        where: { id: target.id },
        data: {
          status: "FAILED",
          failureCode: "FAILED",
          errorMessage: message,
        },
      });
      await prisma.auditLog.create({
        data: {
          workspaceId: target.socialAccount.workspaceId,
          action: "TIKTOK_PUBLISH_FAILED",
          entityType: "SocialPublicationTarget",
          entityId: target.id,
          metadata: { reason: message },
        },
      });
      throw new TikTokApiError(message, "FAILED", 400, false);
    }
    await sleep(delay);
    delay = Math.min(20_000, Math.round(delay * 1.4));
  }
  throw new TikTokApiError("Timeout aguardando o processamento do TikTok.", "timeout", 0, true);
}

export function friendlyPublishError(error: unknown) {
  if (error instanceof TikTokApiError) return error.message;
  if (error instanceof Error) return error.message;
  return "Falha ao publicar no TikTok.";
}
