import { prisma } from "@/lib/db/prisma";
import { getStorage } from "@/lib/storage";
import { probeVideo } from "@/lib/ffmpeg";
import { getUsableAccessToken } from "@/lib/services/social-accounts";
import { PLATFORM_LIMITS } from "@/lib/social/platform-limits";
import { XApiError } from "@/lib/social/x/http";
import { xPublishingAllowed, xPublishingStatus } from "@/lib/social/x/config";
import { composeXCaption, xCaptionMaxChars, xPublishLockKey } from "@/lib/social/x/helpers";
import { xProvider, createXPost } from "@/lib/social/x/provider";
import { xMediaStatus } from "@/lib/social/x/upload";
import { logger } from "@/lib/logger";
import type { SocialPublicationTarget, SocialAccount } from "@/generated/prisma/client";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function publishXTarget(params: {
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
  const idempotencyKey = xPublishLockKey(target.id, params.clipId, target.socialAccountId);
  if (target.idempotencyKey && target.externalPostId && target.status !== "FAILED") return;
  if (target.externalPublishId && target.status === "PROCESSING") {
    return finishX(target, params);
  }

  const claimed = await prisma.socialPublicationTarget.updateMany({
    where: { id: target.id, status: { in: ["QUEUED", "FAILED", "SCHEDULED", "DRAFT"] } },
    data: { status: "UPLOADING", idempotencyKey, errorMessage: null, failureCode: null },
  });
  if (claimed.count === 0) {
    logger.info({ targetId: target.id }, "x publish already in flight");
    return;
  }

  if (!xPublishingAllowed()) {
    const status = xPublishingStatus();
    throw new XApiError(
      status === "PLAN REQUIRED"
        ? "O plano da API do X não permite publicar. É necessário Basic, Pro ou Enterprise."
        : "Acesso de escrita da API do X ainda não está habilitado (X_API_TIER ou X_WRITE_ACCESS_APPROVED).",
      status === "PLAN REQUIRED" ? "plan_restriction" : "api_access_required",
      403,
      false,
    );
  }
  if (!target.socialAccount.scopes.includes("tweet.write") || !target.socialAccount.scopes.includes("media.write")) {
    throw new XApiError("A conta não concedeu tweet.write e media.write. Reconecte o X.", "missing_scope", 403, false);
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
  if (!key) throw new XApiError("Gere o render final antes de publicar.", "invalid_video", 400, false);
  const abs = getStorage().getAbsolutePath(key);
  if (!abs) throw new XApiError("Publicação no X exige o arquivo no storage local para upload chunked.", "invalid_video", 400, false);
  const file = await getStorage().stat(key);
  const probe = await probeVideo(abs);
  const limits = PLATFORM_LIMITS.X;
  if (file.size > limits.maxFileBytes) throw new XApiError("Vídeo excede 512 MB no X.", "invalid_video", 400, false);
  if (probe.durationMs / 1000 > limits.maxDurationSec) {
    throw new XApiError(`Vídeo no X aceita no máximo ${limits.maxDurationSec}s neste fluxo.`, "invalid_video", 400, false);
  }

  const token = await getUsableAccessToken(target.socialAccount);
  await params.onProgress?.(15, "Enviando vídeo ao X (chunked)");
  await prisma.auditLog.create({
    data: {
      userId: params.userId,
      workspaceId: params.workspaceId,
      action: "X_PUBLISH_STARTED",
      entityType: "SocialPublication",
      entityId: params.publicationId,
      metadata: { targetId: target.id },
    },
  });

  const uploaded = await xProvider.publishVideo({
    accessToken: token,
    videoPath: abs,
    videoSize: file.size,
    title: composeXCaption(params.caption, params.hashtags, xCaptionMaxChars()),
  });
  const mediaId = uploaded.publishId!;
  await prisma.socialPublicationTarget.update({
    where: { id: target.id },
    data: { status: "PROCESSING", externalPublishId: mediaId, idempotencyKey },
  });
  const latest = await prisma.socialPublicationTarget.findUniqueOrThrow({
    where: { id: target.id },
    include: { socialAccount: true },
  });
  await finishX(latest, { ...params, caption: params.caption, hashtags: params.hashtags });
}

async function finishX(
  target: SocialPublicationTarget & { socialAccount: SocialAccount },
  params: { caption: string; hashtags: string[]; onProgress?: (progress: number, message: string) => Promise<void> },
) {
  if (target.externalPostId && target.status === "PUBLISHED") return;
  const token = await getUsableAccessToken(target.socialAccount);
  const mediaId = target.externalPublishId;
  if (!mediaId) return;
  const deadline = Date.now() + 12 * 60 * 1000;
  let delay = 2000;
  while (Date.now() < deadline) {
    const status = await xMediaStatus(token, mediaId);
    await params.onProgress?.(Math.min(90, 60), `X: ${status.state ?? status.status}`);
    if (status.status === "FAILED") {
      await failX(target, "media_processing_failed", status.error ?? "O X não processou o vídeo.");
      throw new XApiError(status.error ?? "O X não processou o vídeo.", "media_processing_failed", 400, false);
    }
    if (status.status === "PUBLISHED" || !status.state) {
      const text = composeXCaption(params.caption, params.hashtags, xCaptionMaxChars());
      const tweetId = await createXPost(token, text, mediaId);
      await prisma.socialPublicationTarget.update({
        where: { id: target.id },
        data: { status: "PUBLISHED", externalPostId: tweetId, publishedAt: new Date(), failureCode: null, errorMessage: null },
      });
      await prisma.auditLog.create({
        data: {
          workspaceId: target.socialAccount.workspaceId,
          action: "X_PUBLISHED",
          entityType: "SocialPublicationTarget",
          entityId: target.id,
          metadata: { tweetId },
        },
      });
      return;
    }
    await sleep(Math.max(delay, status.checkAfterSecs * 1000));
    delay = Math.min(20_000, Math.round(delay * 1.4));
  }
  throw new XApiError("Timeout aguardando o processamento do X.", "timeout", 0, true);
}

async function failX(target: SocialPublicationTarget & { socialAccount: SocialAccount }, code: string, message: string) {
  await prisma.socialPublicationTarget.update({
    where: { id: target.id },
    data: { status: "FAILED", failureCode: code, errorMessage: message },
  });
  await prisma.auditLog.create({
    data: {
      workspaceId: target.socialAccount.workspaceId,
      action: "X_PUBLISH_FAILED",
      entityType: "SocialPublicationTarget",
      entityId: target.id,
      metadata: { reason: message },
    },
  });
}
