import { prisma } from "@/lib/db/prisma";
import { getStorage } from "@/lib/storage";
import { probeVideo } from "@/lib/ffmpeg";
import { getUsableAccessToken } from "@/lib/services/social-accounts";
import { MetaApiError } from "@/lib/social/meta/http";
import { createMetaFetchableVideoUrl } from "@/lib/social/meta/media-url";
import { instagramProvider, publishInstagramContainer, fetchInstagramContainerStatus } from "@/lib/social/meta/instagram";
import { facebookProvider } from "@/lib/social/meta/facebook";
import { composeMetaCaption, metaPublishLockKey, validateFacebookReel, validateInstagramReel } from "@/lib/social/meta/publish-helpers";
import { logger } from "@/lib/logger";
import type { MetaProviderMeta } from "@/lib/social/meta/types";
import type { SocialPublicationTarget, SocialAccount } from "@/generated/prisma/client";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function providerMeta(account: SocialAccount): MetaProviderMeta {
  return (account.providerMeta ?? {}) as MetaProviderMeta;
}

export { composeMetaCaption, metaPublishLockKey, validateFacebookReel, validateInstagramReel } from "@/lib/social/meta/publish-helpers";

export async function resolveMetaPublishFile(clipId: string, workspaceId: string) {
  const clip = await prisma.clip.findFirst({
    where: { id: clipId, workspaceId },
    include: {
      renderedAssets: { orderBy: { createdAt: "desc" }, take: 1 },
      renderJobs: { where: { status: "DONE" }, orderBy: { createdAt: "desc" }, take: 1, include: { assets: true } },
    },
  });
  if (!clip) throw new Error("Clip não encontrado");
  const key = clip.renderJobs[0]?.assets[0]?.storageKey ?? clip.renderedAssets[0]?.storageKey ?? clip.storageKey;
  if (!key) throw new MetaApiError("Gere o render final antes de publicar.", "invalid_video", 400, false);
  const abs = getStorage().getAbsolutePath(key);
  const file = await getStorage().stat(key);
  const probe = abs ? await probeVideo(abs) : { durationMs: 0, width: null, height: null, fps: null };
  return { clip, key, abs, size: file.size, probe };
}

async function claimTarget(targetId: string, idempotencyKey: string) {
  return prisma.socialPublicationTarget.updateMany({
    where: { id: targetId, status: { in: ["QUEUED", "FAILED", "SCHEDULED", "DRAFT"] } },
    data: { status: "UPLOADING", idempotencyKey, errorMessage: null, failureCode: null },
  });
}

export async function publishInstagramTarget(params: {
  workspaceId: string;
  userId?: string;
  publicationId: string;
  target: SocialPublicationTarget & { socialAccount: SocialAccount };
  clipId: string;
  caption: string;
  hashtags: string[];
  shareToFeed?: boolean;
  onProgress?: (progress: number, message: string) => Promise<void>;
}) {
  const { target } = params;
  const idempotencyKey = metaPublishLockKey("instagram", target.id, params.clipId, target.socialAccountId);
  if (target.idempotencyKey && (target.externalPostId || target.externalContainerId) && target.status !== "FAILED") {
    return finishInstagram(target, params);
  }
  const claimed = await claimTarget(target.id, idempotencyKey);
  if (claimed.count === 0 && (target.externalContainerId || target.externalPostId)) {
    return finishInstagram(target, params);
  }
  if (claimed.count === 0) {
    logger.info({ targetId: target.id }, "instagram publish already in flight");
    return;
  }

  const meta = providerMeta(target.socialAccount);
  const igUserId = meta.igUserId ?? target.socialAccount.externalAccountId;
  if (!igUserId) throw new MetaApiError("IG User ID ausente.", "unsupported_account", 400, false);
  if (!target.socialAccount.scopes.includes("instagram_content_publish")) {
    throw new MetaApiError("A conta não concedeu instagram_content_publish. Reconecte o Instagram.", "10", 403, false);
  }

  const file = await resolveMetaPublishFile(params.clipId, params.workspaceId);
  validateInstagramReel({ durationMs: file.probe.durationMs, width: file.probe.width, fps: file.probe.fps, size: file.size });
  const videoUrl = await createMetaFetchableVideoUrl(file.key);
  if (!videoUrl) {
    throw new MetaApiError(
      "A Meta precisa baixar o vídeo por HTTPS público. Localhost não funciona. Defina META_MEDIA_BASE_URL com um túnel HTTPS acessível.",
      "localhost_url",
      400,
      false,
    );
  }

  const token = await getUsableAccessToken(target.socialAccount);
  await params.onProgress?.(20, "Criando container Instagram Reels");
  await prisma.auditLog.create({
    data: {
      userId: params.userId,
      workspaceId: params.workspaceId,
      action: "INSTAGRAM_PUBLISH_STARTED",
      entityType: "SocialPublication",
      entityId: params.publicationId,
      metadata: { targetId: target.id },
    },
  });

  const init = await instagramProvider.initializeVideoPost!({
    accessToken: token,
    igUserId,
    videoUrl,
    title: composeMetaCaption(params.caption, params.hashtags, "INSTAGRAM"),
    shareToFeed: params.shareToFeed,
  });

  await prisma.socialPublicationTarget.update({
    where: { id: target.id },
    data: { status: "PROCESSING", externalContainerId: init.publishId, externalPublishId: init.publishId, idempotencyKey },
  });
  const latest = await prisma.socialPublicationTarget.findUniqueOrThrow({
    where: { id: target.id },
    include: { socialAccount: true },
  });
  await finishInstagram(latest, params);
}

async function finishInstagram(
  target: SocialPublicationTarget & { socialAccount: SocialAccount },
  params: { workspaceId: string; onProgress?: (progress: number, message: string) => Promise<void> },
) {
  if (target.externalPostId && target.status === "PUBLISHED") return;
  const token = await getUsableAccessToken(target.socialAccount);
  const containerId = target.externalContainerId ?? target.externalPublishId;
  if (!containerId) return;
  const igUserId = providerMeta(target.socialAccount).igUserId ?? target.socialAccount.externalAccountId;
  const deadline = Date.now() + 12 * 60 * 1000;
  let delay = 5000;
  while (Date.now() < deadline) {
    const code = await fetchInstagramContainerStatus(token, containerId);
    await params.onProgress?.(Math.min(90, 50), `Instagram: ${code}`);
    if (code === "ERROR" || code === "EXPIRED") {
      const message = code === "EXPIRED" ? "O container do Instagram expirou." : "O Instagram não processou o vídeo.";
      await failTarget(target, code === "EXPIRED" ? "container_expired" : "container_error", message, "INSTAGRAM_PUBLISH_FAILED");
      throw new MetaApiError(message, code === "EXPIRED" ? "container_expired" : "container_error", 400, false);
    }
    if (code === "FINISHED" || code === "PUBLISHED") {
      const mediaId = code === "PUBLISHED" ? containerId : await publishInstagramContainer(igUserId, containerId, token);
      await prisma.socialPublicationTarget.update({
        where: { id: target.id },
        data: { status: "PUBLISHED", externalPostId: mediaId, publishedAt: new Date(), failureCode: null, errorMessage: null },
      });
      await prisma.auditLog.create({
        data: {
          workspaceId: target.socialAccount.workspaceId,
          action: "INSTAGRAM_PUBLISHED",
          entityType: "SocialPublicationTarget",
          entityId: target.id,
          metadata: { mediaId },
        },
      });
      return;
    }
    await sleep(delay);
    delay = Math.min(20_000, Math.round(delay * 1.4));
  }
  throw new MetaApiError("Timeout aguardando o processamento do Instagram.", "timeout", 0, true);
}

export async function publishFacebookTarget(params: {
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
  const idempotencyKey = metaPublishLockKey("facebook", target.id, params.clipId, target.socialAccountId);
  if (target.idempotencyKey && target.externalPostId && target.status !== "FAILED") {
    return pollFacebook(target, params.onProgress);
  }
  const claimed = await claimTarget(target.id, idempotencyKey);
  if (claimed.count === 0 && target.externalPublishId) return pollFacebook(target, params.onProgress);
  if (claimed.count === 0) {
    logger.info({ targetId: target.id }, "facebook publish already in flight");
    return;
  }

  const meta = providerMeta(target.socialAccount);
  const pageId = meta.pageId ?? target.socialAccount.externalAccountId;
  if (!pageId) throw new MetaApiError("Page ID ausente.", "page_unavailable", 400, false);
  if (meta.canCreateContent === false) {
    throw new MetaApiError("Você não tem CREATE_CONTENT nesta Página.", "missing_task", 403, false);
  }
  if (!target.socialAccount.scopes.includes("pages_manage_posts")) {
    throw new MetaApiError("A conta não concedeu pages_manage_posts. Reconecte o Facebook.", "10", 403, false);
  }

  const file = await resolveMetaPublishFile(params.clipId, params.workspaceId);
  if (!file.abs) throw new MetaApiError("Publicação no Facebook exige o arquivo no storage local para upload.", "invalid_video", 400, false);
  validateFacebookReel({
    durationMs: file.probe.durationMs,
    width: file.probe.width,
    height: file.probe.height,
    fps: file.probe.fps,
    size: file.size,
  });

  const token = await getUsableAccessToken(target.socialAccount);
  await params.onProgress?.(15, "Enviando Reels à Página do Facebook");
  await prisma.auditLog.create({
    data: {
      userId: params.userId,
      workspaceId: params.workspaceId,
      action: "FACEBOOK_PUBLISH_STARTED",
      entityType: "SocialPublication",
      entityId: params.publicationId,
      metadata: { targetId: target.id, pageId },
    },
  });

  const result = await facebookProvider.publishVideo({
    accessToken: token,
    pageId,
    videoPath: file.abs,
    videoSize: file.size,
    title: composeMetaCaption(params.caption, params.hashtags, "FACEBOOK"),
  });
  const videoId = result.publishId ?? result.externalPostId;
  await prisma.socialPublicationTarget.update({
    where: { id: target.id },
    data: { status: "PROCESSING", externalPublishId: videoId, idempotencyKey },
  });
  const latest = await prisma.socialPublicationTarget.findUniqueOrThrow({
    where: { id: target.id },
    include: { socialAccount: true },
  });
  await pollFacebook(latest, params.onProgress);
}

async function pollFacebook(
  target: SocialPublicationTarget & { socialAccount: SocialAccount },
  onProgress?: (progress: number, message: string) => Promise<void>,
) {
  if (target.externalPostId && target.status === "PUBLISHED") return;
  const token = await getUsableAccessToken(target.socialAccount);
  const videoId = target.externalPublishId ?? target.externalPostId;
  if (!videoId) return;
  const deadline = Date.now() + 12 * 60 * 1000;
  let delay = 4000;
  while (Date.now() < deadline) {
    const status = await facebookProvider.getPostStatus({ accessToken: token, publishId: videoId });
    await onProgress?.(Math.min(95, 70), `Facebook: ${status.status}`);
    if (status.status === "PUBLISHED") {
      await prisma.socialPublicationTarget.update({
        where: { id: target.id },
        data: { status: "PUBLISHED", externalPostId: videoId, publishedAt: new Date(), failureCode: null, errorMessage: null },
      });
      await prisma.auditLog.create({
        data: {
          workspaceId: target.socialAccount.workspaceId,
          action: "FACEBOOK_PUBLISHED",
          entityType: "SocialPublicationTarget",
          entityId: target.id,
          metadata: { videoId },
        },
      });
      return;
    }
    if (status.status === "FAILED") {
      const message = status.failReason ?? "O Facebook não processou o vídeo.";
      await failTarget(target, "FAILED", message, "FACEBOOK_PUBLISH_FAILED");
      throw new MetaApiError(message, "FAILED", 400, false);
    }
    await sleep(delay);
    delay = Math.min(20_000, Math.round(delay * 1.4));
  }
  throw new MetaApiError("Timeout aguardando o processamento do Facebook.", "timeout", 0, true);
}

async function failTarget(
  target: SocialPublicationTarget & { socialAccount: SocialAccount },
  code: string,
  message: string,
  action: string,
) {
  await prisma.socialPublicationTarget.update({
    where: { id: target.id },
    data: { status: "FAILED", failureCode: code, errorMessage: message },
  });
  await prisma.auditLog.create({
    data: {
      workspaceId: target.socialAccount.workspaceId,
      action,
      entityType: "SocialPublicationTarget",
      entityId: target.id,
      metadata: { reason: message },
    },
  });
}

export function friendlyMetaError(error: unknown) {
  if (error instanceof MetaApiError) return error.message;
  if (error instanceof Error) return error.message;
  return "Falha ao publicar na Meta.";
}
