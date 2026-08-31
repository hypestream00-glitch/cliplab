import { openAsBlob } from "node:fs";
import { prisma } from "@/lib/db/prisma";
import { getStorage } from "@/lib/storage";
import { mediaUrlIsSafeForExternalApis } from "@/lib/env/app-url";
import { publicMediaUrl } from "@/lib/storage/url";
import { getSupportedPlatforms, toUploadPostPlatform } from "@/lib/social/upload-post/platforms";
import { requireWorkspaceUploadPostProfile } from "@/lib/social/upload-post/profiles";
import { uploadPostJson, uploadPostRequest, parseUploadPostError } from "@/lib/social/upload-post/http";
import { publicationStatusFromResults, mapPlatformResultStatus } from "@/lib/social/upload-post/status";
import { recordSocialUsage } from "@/lib/social/upload-post/usage";
import { logger } from "@/lib/logger";
import type { PlatformOverrides } from "@/lib/social/unified";
import type { PublicationStatus, SocialPlatform } from "@/generated/prisma/client";

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

async function resolveVideoPayload(clipId: string, workspaceId: string) {
  const clip = await prisma.clip.findFirst({
    where: { id: clipId, workspaceId },
    include: {
      renderedAssets: { orderBy: { createdAt: "desc" }, take: 1 },
      renderJobs: { where: { status: "DONE" }, orderBy: { createdAt: "desc" }, take: 1, include: { assets: true } },
    },
  });
  if (!clip) throw new Error("Clip não encontrado");
  const key = clip.renderJobs[0]?.assets[0]?.storageKey ?? clip.renderedAssets[0]?.storageKey ?? clip.storageKey;
  if (!key) throw new Error("Gere o render final antes de publicar.");
  const storage = getStorage();
  const abs = storage.getAbsolutePath(key);
  if (abs) {
    const blob = await openAsBlob(abs, { type: "video/mp4" });
    return { kind: "file" as const, blob, filename: key.split("/").pop() || "clip.mp4", clip };
  }
  const signed = await storage.getSignedUrl(key, 3600);
  if (signed.url.startsWith("https://") && mediaUrlIsSafeForExternalApis(signed.url)) {
    return { kind: "url" as const, url: signed.url, clip };
  }
  const publicUrl = publicMediaUrl(key);
  if (mediaUrlIsSafeForExternalApis(publicUrl)) {
    return { kind: "url" as const, url: publicUrl, clip };
  }
  throw new Error("O vídeo deste workspace não tem URL HTTPS pública. Configure storage/mídia ou publique a partir do disco local.");
}

export async function clipHasRenderableVideo(clipId: string, workspaceId: string) {
  const clip = await prisma.clip.findFirst({
    where: { id: clipId, workspaceId },
    include: {
      renderedAssets: { take: 1 },
      renderJobs: { where: { status: "DONE" }, take: 1, include: { assets: { take: 1 } } },
    },
  });
  return Boolean(clip?.storageKey || clip?.renderedAssets[0]?.storageKey || clip?.renderJobs[0]?.assets[0]?.storageKey);
}

function appendOverride(form: FormData, overrides?: PlatformOverrides) {
  if (!overrides) return;
  const tiktok = overrides.tiktok;
  if (tiktok?.privacy_level) form.append("privacy_level", tiktok.privacy_level);
  if (tiktok?.disable_comment != null) form.append("disable_comment", String(tiktok.disable_comment));
  if (tiktok?.disable_duet != null) form.append("disable_duet", String(tiktok.disable_duet));
  if (tiktok?.disable_stitch != null) form.append("disable_stitch", String(tiktok.disable_stitch));
  if (tiktok?.tiktok_title) form.append("tiktok_title", tiktok.tiktok_title);
  if (overrides.instagram?.instagram_title) form.append("instagram_title", overrides.instagram.instagram_title);
  if (overrides.instagram?.share_to_feed != null) form.append("share_to_feed", String(overrides.instagram.share_to_feed));
  if (overrides.youtube?.youtube_title) form.append("youtube_title", overrides.youtube.youtube_title);
  if (overrides.youtube?.youtube_description) form.append("youtube_description", overrides.youtube.youtube_description);
  if (overrides.youtube?.privacyStatus) form.append("privacyStatus", overrides.youtube.privacyStatus);
  if (overrides.youtube?.tags?.length) {
    for (const tag of overrides.youtube.tags) form.append("tags[]", tag);
  }
  if (overrides.facebook?.facebook_title) form.append("facebook_title", overrides.facebook.facebook_title);
  if (overrides.x?.x_title) form.append("x_title", overrides.x.x_title);
  if (overrides.linkedin?.linkedin_title) form.append("linkedin_title", overrides.linkedin.linkedin_title);
  if (overrides.linkedin?.visibility) form.append("visibility", overrides.linkedin.visibility);
  if (overrides.threads?.threads_title) form.append("threads_title", overrides.threads.threads_title);
  if (overrides.pinterest?.pinterest_title) form.append("pinterest_title", overrides.pinterest.pinterest_title);
  if (overrides.reddit?.reddit_title) form.append("reddit_title", overrides.reddit.reddit_title);
  if (overrides.reddit?.subreddit) form.append("subreddit", overrides.reddit.subreddit);
}

const TIKTOK_PRIVACY = new Set(["PUBLIC_TO_EVERYONE", "MUTUAL_FOLLOW_FRIENDS", "FOLLOWER_OF_CREATOR", "SELF_ONLY"]);

export function overridesFromPublication(params: {
  caption?: string | null;
  privacy?: string | null;
  disableComment?: boolean;
  disableDuet?: boolean;
  disableStitch?: boolean;
  shareToFeed?: boolean;
  youtubeTitle?: string;
  youtubeDescription?: string;
  youtubePrivacy?: string;
  youtubeTags?: string[];
}): PlatformOverrides {
  const privacy = params.privacy && TIKTOK_PRIVACY.has(params.privacy) ? (params.privacy as NonNullable<PlatformOverrides["tiktok"]>["privacy_level"]) : undefined;
  return {
    tiktok: {
      privacy_level: privacy,
      disable_comment: params.disableComment,
      disable_duet: params.disableDuet,
      disable_stitch: params.disableStitch,
      tiktok_title: params.caption ?? undefined,
    },
    instagram: { instagram_title: params.caption ?? undefined, share_to_feed: params.shareToFeed },
    youtube: {
      youtube_title: params.youtubeTitle,
      youtube_description: params.youtubeDescription,
      privacyStatus: params.youtubePrivacy as "public" | "unlisted" | "private" | undefined,
      tags: params.youtubeTags,
    },
    facebook: { facebook_title: params.caption ?? undefined },
    x: { x_title: params.caption ?? undefined },
  };
}

function safePayload(json: unknown) {
  const record = asObject(json);
  return {
    request_id: record.request_id ?? null,
    job_id: record.job_id ?? null,
    status: record.status ?? null,
    success: record.success ?? null,
    results: record.results ?? record.platforms ?? null,
  };
}

export async function publishViaUploadPost(params: {
  workspaceId: string;
  publicationId: string;
  mode: "now" | "schedule";
}) {
  const publication = await prisma.socialPublication.findFirst({
    where: { id: params.publicationId, workspaceId: params.workspaceId },
    include: { targets: { include: { socialAccount: true } }, clip: true },
  });
  if (!publication || !publication.clipId) throw new Error("Publicação não encontrada");
  if (publication.providerPublicationId && publication.status !== "FAILED") {
    await syncUploadPostPublicationStatus(params.workspaceId, params.publicationId);
    return;
  }

  const profile = await requireWorkspaceUploadPostProfile(params.workspaceId);
  const platforms = publication.targets
    .map((target) => toUploadPostPlatform(target.platform))
    .filter((item): item is NonNullable<typeof item> => Boolean(item));
  if (platforms.length === 0) throw new Error("Nenhuma plataforma suportada pelo Upload-Post nesta publicação.");

  const video = await resolveVideoPayload(publication.clipId, params.workspaceId);
  const form = new FormData();
  form.append("user", profile.username);
  for (const platform of platforms) form.append("platform[]", platform);
  const title = publication.caption || publication.clip?.title || "Clipe CLIPLAB";
  form.append("title", title);
  form.append("async_upload", "true");
  form.append("external_id", publication.id);
  form.append("timezone", publication.timezone);
  if (params.mode === "schedule" && publication.scheduledFor) {
    form.append("scheduled_date", publication.scheduledFor.toISOString());
  }
  if (video.kind === "file") {
    form.append("video", video.blob, video.filename);
  } else {
    form.append("video", video.url);
  }
  const firstOptions = asObject(publication.targets[0]?.platformOptions);
  appendOverride(
    form,
    overridesFromPublication({
      caption: publication.caption,
      privacy: typeof firstOptions.privacy === "string" ? firstOptions.privacy : null,
      disableComment: Boolean(firstOptions.disableComment),
      disableDuet: Boolean(firstOptions.disableDuet),
      disableStitch: Boolean(firstOptions.disableStitch),
      shareToFeed: firstOptions.shareToFeed !== false,
      youtubeTitle: typeof firstOptions.youtubeTitle === "string" ? firstOptions.youtubeTitle : undefined,
      youtubeDescription: typeof firstOptions.youtubeDescription === "string" ? firstOptions.youtubeDescription : undefined,
      youtubePrivacy: typeof firstOptions.youtubePrivacy === "string" ? firstOptions.youtubePrivacy : undefined,
      youtubeTags: Array.isArray(firstOptions.youtubeTags) ? (firstOptions.youtubeTags as string[]) : undefined,
    }),
  );

  const result = await uploadPostRequest({
    method: "POST",
    path: "/upload",
    form,
    headers: {
      "Idempotency-Key": publication.id,
      "X-External-Id": publication.id,
    },
  });
  if (result.status >= 400) {
    throw parseUploadPostError(result.status, result.json, "Falha ao enviar para o Upload-Post.");
  }
  const json = asObject(result.json);
  const requestId = typeof json.request_id === "string" ? json.request_id : null;
  const jobId = typeof json.job_id === "string" ? json.job_id : null;
  const providerId = jobId || requestId || publication.id;
  const scheduled = params.mode === "schedule";
  const status: PublicationStatus = scheduled ? "SCHEDULED" : "PROCESSING";

  logger.info(
    { workspaceId: params.workspaceId, publicationId: publication.id, provider: "upload-post", operation: "publish", status: result.status, requestId },
    "upload-post publish accepted",
  );
  await prisma.socialPublication.update({
    where: { id: publication.id },
    data: {
      provider: "UPLOAD_POST",
      providerPublicationId: providerId,
      providerStatus: typeof json.status === "string" ? json.status : scheduled ? "pending" : "queued",
      providerPayloadSafe: safePayload(result.json),
      status,
      failureCode: null,
      errorMessage: null,
    },
  });
  await prisma.socialPublicationTarget.updateMany({
    where: { publicationId: publication.id },
    data: { status, errorMessage: null, failureCode: null },
  });
  await recordSocialUsage({
    workspaceId: params.workspaceId,
    kind: scheduled ? "post" : "upload",
    reference: providerId,
  });
}

export async function syncUploadPostPublicationStatus(workspaceId: string, publicationId: string) {
  const publication = await prisma.socialPublication.findFirst({
    where: { id: publicationId, workspaceId },
    include: { targets: true },
  });
  if (!publication?.providerPublicationId) return null;
  const isJob = publication.status === "SCHEDULED" || Boolean(asObject(publication.providerPayloadSafe).job_id);
  const json = await uploadPostJson<Record<string, unknown>>({
    method: "GET",
    path: "/uploadposts/status",
    query: isJob
      ? { job_id: publication.providerPublicationId }
      : { request_id: publication.providerPublicationId },
  });
  const results = Array.isArray(json.results) ? (json.results as Array<Record<string, unknown>>) : [];
  const mapped = publicationStatusFromResults({
    topStatus: typeof json.status === "string" ? json.status : undefined,
    scheduled: publication.status === "SCHEDULED" || Boolean(publication.scheduledFor),
    results: results.map((item) => ({
      success: Boolean(item.success),
      status: typeof item.status === "string" ? item.status : undefined,
      skipped: Boolean(item.skipped),
      fallback_to_inbox: Boolean(item.fallback_to_inbox),
    })),
  });
  const publishedAt = mapped === "PUBLISHED" ? new Date() : publication.publishedAt;
  await prisma.socialPublication.update({
    where: { id: publication.id },
    data: {
      status: mapped,
      providerStatus: typeof json.status === "string" ? json.status : publication.providerStatus,
      providerPayloadSafe: safePayload(json),
      publishedAt,
      errorMessage: mapped === "FAILED" ? String(json.message ?? "Falha no Upload-Post") : null,
    },
  });
  for (const target of publication.targets) {
    const platformKey = toUploadPostPlatform(target.platform);
    const result = results.find((item) => String(item.platform).toLowerCase() === platformKey || String(item.platform).toLowerCase() === (platformKey === "twitter" ? "x" : platformKey));
    const targetStatus = result
      ? mapPlatformResultStatus({
          success: Boolean(result.success),
          status: typeof result.status === "string" ? result.status : undefined,
          skipped: Boolean(result.skipped),
          fallback_to_inbox: Boolean(result.fallback_to_inbox),
        })
      : mapped;
    await prisma.socialPublicationTarget.update({
      where: { id: target.id },
      data: {
        status: targetStatus,
        externalPostId: typeof result?.post_id === "string" ? result.post_id : target.externalPostId,
        errorMessage: targetStatus === "FAILED" ? String(result?.message ?? result?.skip_reason ?? "Falha") : null,
      },
    });
  }
  if (mapped === "PUBLISHED" && publication.clipId) {
    await prisma.clip.update({ where: { id: publication.clipId }, data: { status: "PUBLISHED" } });
  }
  return mapped;
}

export async function retryUploadPostPublication(workspaceId: string, publicationId: string) {
  const publication = await prisma.socialPublication.findFirst({
    where: { id: publicationId, workspaceId },
  });
  if (!publication?.providerPublicationId) throw new Error("Publicação sem identificador remoto.");
  const payload = asObject(publication.providerPayloadSafe);
  const body = payload.job_id
    ? { job_id: String(payload.job_id) }
    : { request_id: publication.providerPublicationId };
  await uploadPostJson({ method: "POST", path: "/uploadposts/posts/retry", json: body });
  await prisma.socialPublication.update({
    where: { id: publication.id },
    data: { status: "PROCESSING", errorMessage: null, failureCode: null },
  });
}

export async function cancelUploadPostSchedule(workspaceId: string, publicationId: string) {
  const publication = await prisma.socialPublication.findFirst({
    where: { id: publicationId, workspaceId },
  });
  if (!publication?.providerPublicationId) return;
  const result = await uploadPostRequest({
    method: "DELETE",
    path: `/uploadposts/schedule/${encodeURIComponent(publication.providerPublicationId)}`,
  });
  if (result.status === 404) return;
  if (result.status >= 400) {
    throw parseUploadPostError(result.status, result.json, "Não foi possível cancelar o agendamento.");
  }
}

export async function updateUploadPostSchedule(params: {
  workspaceId: string;
  publicationId: string;
  scheduledFor: Date;
  timezone?: string;
}) {
  const publication = await prisma.socialPublication.findFirst({
    where: { id: params.publicationId, workspaceId: params.workspaceId },
  });
  if (!publication?.providerPublicationId) throw new Error("Agendamento remoto não encontrado.");
  await uploadPostJson({
    method: "PATCH",
    path: `/uploadposts/schedule/${encodeURIComponent(publication.providerPublicationId)}`,
    json: {
      scheduled_date: params.scheduledFor.toISOString(),
      timezone: params.timezone ?? publication.timezone,
    },
  });
  await prisma.socialPublication.update({
    where: { id: publication.id },
    data: { scheduledFor: params.scheduledFor, timezone: params.timezone ?? publication.timezone },
  });
  await prisma.schedule.updateMany({
    where: { publicationId: publication.id },
    data: { scheduledFor: params.scheduledFor, timezone: params.timezone ?? publication.timezone },
  });
}

export async function syncDueUploadPostStatuses() {
  const rows = await prisma.socialPublication.findMany({
    where: {
      provider: "UPLOAD_POST",
      status: { in: ["QUEUED", "UPLOADING", "PROCESSING", "SCHEDULED"] },
      providerPublicationId: { not: null },
    },
    take: 20,
  });
  for (const row of rows) {
    await syncUploadPostPublicationStatus(row.workspaceId, row.id).catch(() => undefined);
  }
  return rows.length;
}

export function supportedPublishPlatforms(): SocialPlatform[] {
  return getSupportedPlatforms();
}
