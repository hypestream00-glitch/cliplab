import { prisma } from "@/lib/db/prisma";
import { getStorage } from "@/lib/storage";
import { probeVideo } from "@/lib/ffmpeg";
import { getUsableAccessToken } from "@/lib/services/social-accounts";
import { PLATFORM_LIMITS } from "@/lib/social/platform-limits";
import { YouTubeApiError } from "@/lib/social/youtube/http";
import { composeYouTubeDescription, composeYouTubeTitle, youtubePublishLockKey } from "@/lib/social/youtube/helpers";
import { youtubeProvider, setYouTubeThumbnail } from "@/lib/social/youtube/provider";
import { logger } from "@/lib/logger";
import type { SocialPublicationTarget, SocialAccount } from "@/generated/prisma/client";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function publishYouTubeTarget(params: {
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
  const options = (target.platformOptions ?? {}) as {
    privacy?: string;
    youtubeTitle?: string;
    youtubeDescription?: string;
    youtubeTags?: string[];
  };
  const idempotencyKey = youtubePublishLockKey(target.id, params.clipId, target.socialAccountId);
  if (target.idempotencyKey && target.externalPostId && target.status === "PUBLISHED") return;
  if (target.externalPostId && target.status === "PROCESSING") {
    return pollYouTube(target, params.onProgress);
  }

  const claimed = await prisma.socialPublicationTarget.updateMany({
    where: { id: target.id, status: { in: ["QUEUED", "FAILED", "SCHEDULED", "DRAFT"] } },
    data: { status: "UPLOADING", idempotencyKey, errorMessage: null, failureCode: null },
  });
  if (claimed.count === 0) {
    logger.info({ targetId: target.id }, "youtube publish already in flight");
    return;
  }

  const clip = await prisma.clip.findFirst({
    where: { id: params.clipId, workspaceId: params.workspaceId },
    include: {
      renderedAssets: { orderBy: { createdAt: "desc" }, take: 1 },
      renderJobs: { where: { status: "DONE" }, orderBy: { createdAt: "desc" }, take: 1, include: { assets: true } },
    },
  });
  if (!clip) throw new Error("Clip não encontrado");
  const key = clip.renderJobs[0]?.assets[0]?.storageKey ?? clip.renderedAssets[0]?.storageKey ?? clip.storageKey;
  if (!key) throw new YouTubeApiError("Gere o render final antes de publicar.", "invalid_video", 400, false);
  const abs = getStorage().getAbsolutePath(key);
  if (!abs) throw new YouTubeApiError("Upload YouTube exige o arquivo no storage local (resumable).", "invalid_video", 400, false);
  const file = await getStorage().stat(key);
  const probe = await probeVideo(abs);
  if (file.size > PLATFORM_LIMITS.YOUTUBE.maxFileBytes) {
    throw new YouTubeApiError("Vídeo excede o limite do YouTube Data API neste fluxo.", "invalid_video", 400, false);
  }
  if (probe.durationMs / 1000 < PLATFORM_LIMITS.YOUTUBE.minDurationSec) {
    throw new YouTubeApiError("Vídeo curto demais para o YouTube.", "invalid_video", 400, false);
  }

  const token = await getUsableAccessToken(target.socialAccount);
  const title = composeYouTubeTitle(options.youtubeTitle || clip.title || params.caption);
  const description = options.youtubeDescription || composeYouTubeDescription(params.caption, params.hashtags);
  await params.onProgress?.(10, "Iniciando upload resumable no YouTube");
  await prisma.auditLog.create({
    data: {
      userId: params.userId,
      workspaceId: params.workspaceId,
      action: "YOUTUBE_UPLOAD_STARTED",
      entityType: "SocialPublication",
      entityId: params.publicationId,
      metadata: { targetId: target.id },
    },
  });

  const result = await youtubeProvider.publishVideo({
    accessToken: token,
    videoPath: abs,
    videoSize: file.size,
    title,
    description,
    tags: options.youtubeTags ?? params.hashtags,
    privacyLevel: options.privacy || "public",
    onProgress: (ratio) => {
      void params.onProgress?.(Math.round(10 + ratio * 70), "Enviando vídeo ao YouTube");
    },
  });
  const videoId = result.externalPostId ?? result.publishId;
  if (!videoId) throw new YouTubeApiError("YouTube não retornou videoId.", "invalid_response", 400, false);

  if (clip.thumbnailKey) {
    const thumbAbs = getStorage().getAbsolutePath(clip.thumbnailKey);
    if (thumbAbs) {
      try {
        const thumb = await getStorage().stat(clip.thumbnailKey);
        await setYouTubeThumbnail(token, videoId, thumbAbs, thumb.size);
      } catch (error) {
        logger.warn({ err: error }, "youtube thumbnail skipped");
      }
    }
  }

  await prisma.socialPublicationTarget.update({
    where: { id: target.id },
    data: { status: "PROCESSING", externalPostId: videoId, externalPublishId: videoId, idempotencyKey },
  });
  const latest = await prisma.socialPublicationTarget.findUniqueOrThrow({
    where: { id: target.id },
    include: { socialAccount: true },
  });
  await pollYouTube(latest, params.onProgress);
}

async function pollYouTube(
  target: SocialPublicationTarget & { socialAccount: SocialAccount },
  onProgress?: (progress: number, message: string) => Promise<void>,
) {
  if (target.status === "PUBLISHED" && target.externalPostId) return;
  const token = await getUsableAccessToken(target.socialAccount);
  const videoId = target.externalPostId ?? target.externalPublishId;
  if (!videoId) return;
  const deadline = Date.now() + 20 * 60 * 1000;
  let delay = 5000;
  while (Date.now() < deadline) {
    const status = await youtubeProvider.getPostStatus({ accessToken: token, publishId: videoId });
    await onProgress?.(Math.min(95, 80), `YouTube: ${status.status}`);
    if (status.status === "PUBLISHED") {
      await prisma.socialPublicationTarget.update({
        where: { id: target.id },
        data: { status: "PUBLISHED", externalPostId: videoId, publishedAt: new Date(), failureCode: null, errorMessage: null },
      });
      await prisma.auditLog.create({
        data: {
          workspaceId: target.socialAccount.workspaceId,
          action: "YOUTUBE_PUBLISHED",
          entityType: "SocialPublicationTarget",
          entityId: target.id,
          metadata: { videoId },
        },
      });
      return;
    }
    if (status.status === "FAILED") {
      await prisma.socialPublicationTarget.update({
        where: { id: target.id },
        data: { status: "FAILED", failureCode: "processingFailure", errorMessage: status.failReason ?? "Processamento falhou." },
      });
      await prisma.auditLog.create({
        data: {
          workspaceId: target.socialAccount.workspaceId,
          action: "YOUTUBE_PUBLISH_FAILED",
          entityType: "SocialPublicationTarget",
          entityId: target.id,
          metadata: { reason: status.failReason },
        },
      });
      throw new YouTubeApiError(status.failReason ?? "Processamento falhou no YouTube.", "processingFailure", 400, false);
    }
    await sleep(delay);
    delay = Math.min(30_000, Math.round(delay * 1.4));
  }
  throw new YouTubeApiError("Timeout aguardando o processamento do YouTube.", "timeout", 0, true);
}
