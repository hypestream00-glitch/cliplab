import { prisma } from "@/lib/db/prisma";
import { enqueue } from "@/lib/queue";
import { getSocialProvider } from "@/lib/social";
import { createMockSocialProvider } from "@/lib/social/mock";
import { logger } from "@/lib/logger";
import { publishTikTokTarget } from "@/lib/services/tiktok-publish";
import { publishInstagramTarget, publishFacebookTarget } from "@/lib/services/meta-publish";
import { publishXTarget } from "@/lib/services/x-publish";
import { publishYouTubeTarget } from "@/lib/services/youtube-publish";
import { captionLimitForPlatforms, hashtagLimitForPlatforms } from "@/lib/social/platform-limits";
import { TikTokApiError } from "@/lib/social/tiktok/http";
import { MetaApiError } from "@/lib/social/meta/http";
import { XApiError } from "@/lib/social/x/http";
import { YouTubeApiError } from "@/lib/social/youtube/http";
import { notifyWorkspace } from "@/lib/services/notifications";
import { canCancelPublication } from "@/lib/social/publication-status";
import { isUploadPostPrimary } from "@/lib/social/router";
import {
  publishViaUploadPost,
  retryUploadPostPublication,
  cancelUploadPostSchedule,
  syncUploadPostPublicationStatus,
} from "@/lib/social/upload-post/publish";
import { UploadPostApiError, UploadPostConfigError, UploadPostPlanError } from "@/lib/social/upload-post/errors";
import { visibleClipWhere, visibleClipLibraryWhere, visibleSocialAccountWhere } from "@/lib/data/visibility";

export async function createPublication(params: {
  workspaceId: string;
  clipId: string;
  accountIds: string[];
  caption?: string;
  hashtags?: string[];
  mode: "now" | "schedule" | "queue";
  scheduledFor?: Date;
  timezone: string;
  privacy?: string;
  disableComment?: boolean;
  disableDuet?: boolean;
  disableStitch?: boolean;
  shareToFeed?: boolean;
  youtubeTitle?: string;
  youtubeDescription?: string;
  youtubePrivacy?: string;
  youtubeTags?: string[];
  confirmReal?: boolean;
}) {
  const clip = await prisma.clip.findFirst({
    where: { id: params.clipId, ...visibleClipWhere(params.workspaceId) },
  });
  if (!clip) throw new Error("Clip não encontrado");
  const hasVideo = Boolean(clip.storageKey);
  if (!hasVideo) {
    const assets = await prisma.renderedAsset.findFirst({ where: { clipId: clip.id } }).catch(() => null);
    const done = await prisma.renderJob.findFirst({
      where: { clipId: clip.id, status: "DONE" },
      include: { assets: { take: 1 } },
    });
    if (!assets && !done?.assets[0]) {
      throw new Error("Gere o render final antes de publicar.");
    }
  }
  const accounts = await prisma.socialAccount.findMany({
    where: {
      id: { in: params.accountIds },
      ...visibleSocialAccountWhere(params.workspaceId),
      status: { in: ["CONNECTED", "TOKEN_EXPIRING"] },
    },
  });
  if (accounts.length === 0) throw new Error("Selecione ao menos uma conta conectada");
  if (params.mode === "schedule" && !params.scheduledFor) {
    throw new Error("Informe data e hora para agendar");
  }

  const captionLimit = captionLimitForPlatforms(accounts.map((account) => account.platform));
  const hashtagLimit = hashtagLimitForPlatforms(accounts.map((account) => account.platform));
  const caption = (params.caption ?? clip.suggestedCaption ?? clip.title).slice(0, captionLimit);
  const hashtags = (params.hashtags?.length ? params.hashtags : clip.hashtags).slice(0, hashtagLimit);
  const realSocial = accounts.some(
    (account) =>
      (account.provider === "UPLOAD_POST" || ["TIKTOK", "INSTAGRAM", "FACEBOOK", "X", "YOUTUBE"].includes(account.platform)) &&
      !account.mock,
  );
  if (realSocial && !params.confirmReal) {
    throw new Error("Confirme a publicação real nesta conta.");
  }
  const useUploadPost = isUploadPostPrimary() && accounts.some((account) => account.provider === "UPLOAD_POST" && !account.mock);
  const status = params.mode === "schedule" ? "SCHEDULED" : "QUEUED";
  const scheduledFor =
    params.mode === "schedule" ? params.scheduledFor : params.mode === "now" ? new Date() : null;

  const publication = await prisma.socialPublication.create({
    data: {
      workspaceId: params.workspaceId,
      clipId: clip.id,
      caption,
      hashtags,
      status,
      scheduledFor,
      timezone: params.timezone,
      mock: !realSocial,
      provider: useUploadPost ? "UPLOAD_POST" : "NATIVE",
      targets: {
        create: accounts.map((account) => ({
          socialAccountId: account.id,
          platform: account.platform,
          status,
          privacy: params.youtubePrivacy || params.privacy,
          platformOptions: {
            privacy: params.youtubePrivacy || params.privacy,
            disableComment: params.disableComment,
            disableDuet: params.disableDuet,
            disableStitch: params.disableStitch,
            shareToFeed: params.shareToFeed,
            youtubeTitle: params.youtubeTitle,
            youtubeDescription: params.youtubeDescription,
            youtubeTags: params.youtubeTags,
          },
        })),
      },
    },
  });

  if (params.mode === "schedule" && scheduledFor) {
    await prisma.schedule.create({
      data: {
        workspaceId: params.workspaceId,
        publicationId: publication.id,
        scheduledFor,
        timezone: params.timezone,
      },
    });
  }

  if (useUploadPost && params.mode === "schedule") {
    await publishViaUploadPost({ workspaceId: params.workspaceId, publicationId: publication.id, mode: "schedule" });
    return publication;
  }

  if (params.mode !== "schedule") {
    await enqueuePublication(params.workspaceId, publication.id, params.mode === "queue" ? "Na fila" : "Publicando");
  }

  return publication;
}

export async function processPublication(publicationId: string) {
  const publication = await prisma.socialPublication.findUnique({
    where: { id: publicationId },
    include: { targets: { include: { socialAccount: true } }, clip: true },
  });
  if (!publication || !publication.clipId) return;
  if (publication.status === "CANCELED") return;

  if (publication.provider === "UPLOAD_POST" && publication.status === "SCHEDULED" && publication.providerPublicationId) {
    await syncUploadPostPublicationStatus(publication.workspaceId, publicationId);
    return;
  }

  const claimed = await prisma.socialPublication.updateMany({
    where: { id: publicationId, status: { in: ["QUEUED", "SCHEDULED", "FAILED"] } },
    data: { status: "UPLOADING" },
  });
  if (claimed.count === 0 && !["UPLOADING", "PROCESSING"].includes(publication.status)) {
    return;
  }

  if (publication.provider === "UPLOAD_POST") {
    try {
      await publishViaUploadPost({ workspaceId: publication.workspaceId, publicationId, mode: publication.scheduledFor ? "schedule" : "now" });
      const status = await syncUploadPostPublicationStatus(publication.workspaceId, publicationId);
      await prisma.processingJob.updateMany({
        where: { entityId: publicationId, type: "SOCIAL_PUBLISHING" },
        data: {
          status: status === "PUBLISHED" ? "COMPLETED" : status === "FAILED" ? "FAILED" : "ACTIVE",
          progress: status === "PUBLISHED" ? 100 : 70,
          message: status === "PUBLISHED" ? "Publicado" : "Enviado ao Upload-Post",
          finishedAt: status === "PUBLISHED" || status === "FAILED" ? new Date() : null,
        },
      });
      if (status === "PUBLISHED") {
        await notifyWorkspace({
          workspaceId: publication.workspaceId,
          type: "PUBLISH_SUCCESS",
          title: "Publicação concluída",
          body: `${publication.clip?.title ?? "Publicação"} publicada.`,
          entityType: "SocialPublication",
          entityId: publicationId,
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha ao publicar";
      const code =
        error instanceof UploadPostApiError || error instanceof UploadPostPlanError || error instanceof UploadPostConfigError
          ? ("code" in error ? String(error.code ?? "ERROR") : "ERROR")
          : "ERROR";
      logger.error({ err: error, publicationId }, "upload-post publication failed");
      await prisma.socialPublication.update({
        where: { id: publicationId },
        data: { status: "FAILED", errorMessage: message, failureCode: code },
      });
      await prisma.socialPublicationTarget.updateMany({
        where: { publicationId },
        data: { status: "FAILED", errorMessage: message, failureCode: code },
      });
      await prisma.processingJob.updateMany({
        where: { entityId: publicationId, type: "SOCIAL_PUBLISHING" },
        data: { status: "FAILED", message, finishedAt: new Date(), errorMessage: message },
      });
      await notifyWorkspace({
        workspaceId: publication.workspaceId,
        type: "PUBLISH_FAILED",
        title: "Publicação falhou",
        body: message,
        entityType: "SocialPublication",
        entityId: publicationId,
      });
    }
    return;
  }

  let anyMock = false;
  let anyFail = false;
  for (const target of publication.targets) {
    try {
      if (target.platform === "TIKTOK" && !target.socialAccount.mock) {
        await publishTikTokTarget({
          workspaceId: publication.workspaceId,
          publicationId,
          target,
          clipId: publication.clipId,
          caption: publication.caption ?? publication.clip?.title ?? "",
          hashtags: publication.hashtags,
          onProgress: async (progress, message) => {
            await prisma.processingJob.updateMany({
              where: { entityId: publicationId, type: "SOCIAL_PUBLISHING" },
              data: { status: "ACTIVE", progress, message },
            });
          },
        });
      } else if (target.platform === "INSTAGRAM" && !target.socialAccount.mock) {
        const options = (target.platformOptions ?? {}) as { shareToFeed?: boolean };
        await publishInstagramTarget({
          workspaceId: publication.workspaceId,
          publicationId,
          target,
          clipId: publication.clipId,
          caption: publication.caption ?? publication.clip?.title ?? "",
          hashtags: publication.hashtags,
          shareToFeed: options.shareToFeed,
          onProgress: async (progress, message) => {
            await prisma.processingJob.updateMany({
              where: { entityId: publicationId, type: "SOCIAL_PUBLISHING" },
              data: { status: "ACTIVE", progress, message },
            });
          },
        });
      } else if (target.platform === "FACEBOOK" && !target.socialAccount.mock) {
        await publishFacebookTarget({
          workspaceId: publication.workspaceId,
          publicationId,
          target,
          clipId: publication.clipId,
          caption: publication.caption ?? publication.clip?.title ?? "",
          hashtags: publication.hashtags,
          onProgress: async (progress, message) => {
            await prisma.processingJob.updateMany({
              where: { entityId: publicationId, type: "SOCIAL_PUBLISHING" },
              data: { status: "ACTIVE", progress, message },
            });
          },
        });
      } else if (target.platform === "X" && !target.socialAccount.mock) {
        await publishXTarget({
          workspaceId: publication.workspaceId,
          publicationId,
          target,
          clipId: publication.clipId,
          caption: publication.caption ?? publication.clip?.title ?? "",
          hashtags: publication.hashtags,
          onProgress: async (progress, message) => {
            await prisma.processingJob.updateMany({
              where: { entityId: publicationId, type: "SOCIAL_PUBLISHING" },
              data: { status: "ACTIVE", progress, message },
            });
          },
        });
      } else if (target.platform === "YOUTUBE" && !target.socialAccount.mock) {
        await publishYouTubeTarget({
          workspaceId: publication.workspaceId,
          publicationId,
          target,
          clipId: publication.clipId,
          caption: publication.caption ?? publication.clip?.title ?? "",
          hashtags: publication.hashtags,
          onProgress: async (progress, message) => {
            await prisma.processingJob.updateMany({
              where: { entityId: publicationId, type: "SOCIAL_PUBLISHING" },
              data: { status: "ACTIVE", progress, message },
            });
          },
        });
      } else {
        anyMock = true;
        const provider = target.socialAccount.mock
          ? createMockSocialProvider(target.platform)
          : getSocialProvider(target.platform);
        const result = await provider.publishVideo();
        await prisma.socialPublicationTarget.update({
          where: { id: target.id },
          data: { status: "PUBLISHED", externalPostId: result.externalPostId ?? `mock_${target.id}` },
        });
      }
    } catch (error) {
      anyFail = true;
      const retryable =
        (error instanceof TikTokApiError || error instanceof MetaApiError || error instanceof XApiError || error instanceof YouTubeApiError) &&
        error.retryable;
      logger.error({ err: error, targetId: target.id }, "publication target failed");
      await prisma.socialPublicationTarget.update({
        where: { id: target.id },
        data: {
          status: "FAILED",
          failureCode:
            error instanceof TikTokApiError || error instanceof MetaApiError || error instanceof XApiError || error instanceof YouTubeApiError
              ? error.code
              : "ERROR",
          errorMessage: error instanceof Error ? error.message : "Falha ao publicar",
        },
      });
      if (retryable) throw error;
    }
  }

  const targets = await prisma.socialPublicationTarget.findMany({ where: { publicationId } });
  const allPublished = targets.every((item) => item.status === "PUBLISHED");
  await prisma.socialPublication.update({
    where: { id: publicationId },
    data: {
      status: allPublished ? "PUBLISHED" : anyFail ? "FAILED" : "PROCESSING",
      publishedAt: allPublished ? new Date() : null,
      mock: anyMock && !targets.some((item) => ["TIKTOK", "INSTAGRAM", "FACEBOOK", "X", "YOUTUBE"].includes(item.platform) && item.status === "PUBLISHED"),
      errorMessage: anyFail ? targets.find((item) => item.errorMessage)?.errorMessage : null,
    },
  });
  if (allPublished && publication.clipId) {
    await prisma.clip.update({ where: { id: publication.clipId }, data: { status: "PUBLISHED" } });
  }
  await prisma.processingJob.updateMany({
    where: { entityId: publicationId, type: "SOCIAL_PUBLISHING" },
    data: {
      status: allPublished ? "COMPLETED" : anyFail ? "FAILED" : "ACTIVE",
      progress: allPublished ? 100 : 80,
      message: allPublished
        ? anyMock
          ? "Publicado (outras redes em modo de desenvolvimento)"
          : "Publicado"
        : "Aguardando processamento",
      finishedAt: allPublished || anyFail ? new Date() : null,
      errorMessage: anyFail ? targets.find((item) => item.errorMessage)?.errorMessage : null,
    },
  });
  if (allPublished) {
    await notifyWorkspace({
      workspaceId: publication.workspaceId,
      type: "PUBLISH_SUCCESS",
      title: "Publicação concluída",
      body: publication.mock
        ? `${publication.clip?.title ?? "Publicação"} — inclui destinos DEMO/mock.`
        : `${publication.clip?.title ?? "Publicação"} publicada.`,
      entityType: "SocialPublication",
      entityId: publicationId,
    });
  } else if (anyFail) {
    await notifyWorkspace({
      workspaceId: publication.workspaceId,
      type: "PUBLISH_FAILED",
      title: "Publicação falhou",
      body: targets.find((item) => item.errorMessage)?.errorMessage ?? "Falha ao publicar.",
      entityType: "SocialPublication",
      entityId: publicationId,
    });
  }
}

export async function enqueuePublication(workspaceId: string, publicationId: string, message: string) {
  const publication = await prisma.socialPublication.findFirst({
    where: { id: publicationId, workspaceId },
  });
  if (!publication) throw new Error("Publicação não encontrada");
  await prisma.socialPublication.update({
    where: { id: publication.id },
    data: { status: "QUEUED" },
  });
  await prisma.socialPublicationTarget.updateMany({
    where: { publicationId: publication.id, status: { not: "PUBLISHED" } },
    data: { status: "QUEUED" },
  });
  const job = await prisma.processingJob.create({
    data: {
      workspaceId,
      type: "SOCIAL_PUBLISHING",
      entityId: publication.id,
      status: "WAITING",
      message,
    },
  });
  await enqueue("social-publishing", {
    jobId: job.id,
    workspaceId,
    entityId: publication.id,
    type: "social-publishing",
  });
  return publication;
}

export async function publishNow(workspaceId: string, publicationId: string) {
  return enqueuePublication(workspaceId, publicationId, "Publicando agora");
}

export async function retryPublication(workspaceId: string, publicationId: string) {
  const publication = await prisma.socialPublication.findFirst({
    where: { id: publicationId, workspaceId },
    include: { targets: true },
  });
  if (!publication) throw new Error("Publicação não encontrada");
  if (publication.provider === "UPLOAD_POST") {
    await retryUploadPostPublication(workspaceId, publicationId);
    return publication;
  }
  const failed = publication.targets.filter((target) => target.status === "FAILED");
  const canRetry = failed.some((target) => {
    const code = target.failureCode ?? "";
    return ["timeout", "unavailable", "rate_limit_exceeded", "internal", "network", "quota_exceeded", "quotaExceeded"].includes(code);
  });
  if (!canRetry && failed.length) {
    throw new Error("Esta falha não é recuperável. Corrija o vídeo/escopo e crie uma nova publicação.");
  }
  return enqueuePublication(workspaceId, publicationId, "Nova tentativa");
}

export async function cancelPublication(workspaceId: string, publicationId: string) {
  const publication = await prisma.socialPublication.findFirst({
    where: { id: publicationId, workspaceId },
  });
  if (!publication) throw new Error("Publicação não encontrada");
  if (!canCancelPublication(publication.status)) {
    throw new Error("Não é possível cancelar uma publicação já em andamento ou publicada.");
  }
  const claimed = await prisma.socialPublication.updateMany({
    where: { id: publication.id, workspaceId, status: { in: ["DRAFT", "SCHEDULED", "QUEUED"] } },
    data: { status: "CANCELED", errorMessage: null },
  });
  if (claimed.count === 0) {
    throw new Error("Não é possível cancelar uma publicação já em andamento ou publicada.");
  }
  if (publication.provider === "UPLOAD_POST") {
    await cancelUploadPostSchedule(workspaceId, publicationId).catch((error) => {
      logger.warn({ err: error, publicationId }, "upload-post cancel schedule failed");
    });
  }
  await prisma.socialPublicationTarget.updateMany({
    where: { publicationId: publication.id, status: { not: "PUBLISHED" } },
    data: { status: "CANCELED" },
  });
  const jobs = await prisma.processingJob.findMany({
    where: { entityId: publication.id, type: "SOCIAL_PUBLISHING", status: { in: ["WAITING", "DELAYED", "ACTIVE"] } },
    select: { id: true },
  });
  await prisma.processingJob.updateMany({
    where: { entityId: publication.id, type: "SOCIAL_PUBLISHING", status: { in: ["WAITING", "DELAYED", "ACTIVE"] } },
    data: { status: "CANCELED", message: "Cancelada pelo usuário", finishedAt: new Date() },
  });
  try {
    const { getQueue, jobIdentityKey } = await import("@/lib/queue");
    const queue = getQueue("social-publishing");
    if (queue) {
      for (const job of jobs) {
        const bullJob = await queue.getJob(
          jobIdentityKey("social-publishing", {
            jobId: job.id,
            workspaceId,
            entityId: publication.id,
            type: "social-publishing",
          }),
        );
        await bullJob?.remove().catch(() => undefined);
      }
    }
  } catch {
    /* queue removal is best-effort; status guard is the source of truth */
  }
  return publication;
}

export async function enqueueDueScheduledPublications() {
  const due = await prisma.socialPublication.findMany({
    where: { status: "SCHEDULED", mock: false, scheduledFor: { lte: new Date() }, provider: { not: "UPLOAD_POST" } },
    take: 10,
  });
  for (const item of due) {
    await enqueuePublication(item.workspaceId, item.id, "Agendamento vencido");
  }
  return due.length;
}

export async function runEnabledAutopilotRules(workspaceId: string) {
  const rules = await prisma.autopilotRule.findMany({
    where: { workspaceId, enabled: true, consentGiven: true },
  });
  const created: string[] = [];
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  for (const rule of rules) {
    const dest = rule.destinations as { platforms?: string | string[]; socialAccountId?: string };
    const platforms = (Array.isArray(dest.platforms) ? dest.platforms : [dest.platforms ?? "TIKTOK"]).filter(Boolean);
    const postedToday = await prisma.socialPublication.count({
      where: { workspaceId, createdAt: { gte: startOfDay } },
    });
    const remaining = Math.max(0, rule.maxPostsPerDay - postedToday);
    if (remaining === 0) continue;

    const clips = await prisma.clip.findMany({
      where: {
        ...visibleClipLibraryWhere(workspaceId),
        status: { in: ["READY", "RENDERED"] },
        score: { overall: { gte: rule.minimumScore } },
      },
      include: { score: true },
      orderBy: { createdAt: "desc" },
      take: remaining,
    });
    const accounts = await prisma.socialAccount.findMany({
      where: {
        ...visibleSocialAccountWhere(workspaceId),
        status: { in: ["CONNECTED", "TOKEN_EXPIRING"] },
        platform: { in: platforms as never },
        id: dest.socialAccountId ? dest.socialAccountId : undefined,
      },
    });
    if (accounts.length === 0) continue;

    for (const clip of clips) {
      const already = await prisma.socialPublication.findFirst({
        where: { workspaceId, clipId: clip.id, targets: { some: { socialAccountId: { in: accounts.map((item) => item.id) } } } },
      });
      if (already) continue;
      const caption = rule.captionPrompt
        ? `${clip.suggestedCaption ?? clip.title}\n${rule.captionPrompt}`
        : (clip.suggestedCaption ?? clip.title);
      const publication = await createPublication({
        workspaceId,
        clipId: clip.id,
        accountIds: accounts.map((account) => account.id),
        caption,
        hashtags: clip.hashtags,
        mode: "queue",
        timezone: "America/Sao_Paulo",
        confirmReal: true,
      });
      created.push(publication.id);
    }
  }
  return created.length;
}
