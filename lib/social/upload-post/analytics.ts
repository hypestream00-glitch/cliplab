import { prisma } from "@/lib/db/prisma";
import { ANALYTICS_PLATFORMS, fromUploadPostPlatform, toUploadPostPlatform } from "@/lib/social/upload-post/platforms";
import { requireWorkspaceUploadPostProfile } from "@/lib/social/upload-post/profiles";
import { uploadPostJson } from "@/lib/social/upload-post/http";
import { recordSocialUsage } from "@/lib/social/upload-post/usage";

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function flags(record: Record<string, unknown>) {
  return {
    followers: num(record.followers) != null,
    views: num(record.views) != null || num(record.impressions) != null,
    likes: num(record.likes) != null,
    comments: num(record.comments) != null,
    shares: num(record.shares) != null,
    posts: num(record.posts) != null || num(record.posts_count) != null,
    engagement: num(record.engagement) != null,
  };
}

export function normalizeUploadPostAnalytics(platformPayload: unknown) {
  const record = platformPayload && typeof platformPayload === "object" ? (platformPayload as Record<string, unknown>) : {};
  const views = num(record.views) ?? num(record.impressions);
  const likes = num(record.likes);
  const comments = num(record.comments);
  const shares = num(record.shares);
  const followers = num(record.followers);
  const posts = num(record.posts) ?? num(record.posts_count);
  const engagement =
    num(record.engagement) ??
    (views && views > 0 ? ((likes ?? 0) + (comments ?? 0) + (shares ?? 0)) / views * 100 : null);
  return {
    followers,
    views,
    likes,
    comments,
    shares,
    posts,
    engagement,
    available: flags(record),
  };
}

export async function syncUploadPostAnalytics(workspaceId: string) {
  const profile = await requireWorkspaceUploadPostProfile(workspaceId);
  const accounts = await prisma.socialAccount.findMany({
    where: { workspaceId, provider: "UPLOAD_POST", status: { in: ["CONNECTED", "TOKEN_EXPIRING"] } },
  });
  if (accounts.length === 0) return [];
  const platforms = accounts
    .map((account) => toUploadPostPlatform(account.platform))
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .map((item) => (item === "twitter" ? "x" : item));
  const unique = [...new Set(platforms.filter((item) => ANALYTICS_PLATFORMS.includes(item as (typeof ANALYTICS_PLATFORMS)[number])))];
  if (unique.length === 0) return [];
  const json = await uploadPostJson<Record<string, unknown>>({
    method: "GET",
    path: `/analytics/${encodeURIComponent(profile.username)}`,
    query: { platforms: unique.join(",") },
  });
  const now = new Date();
  for (const account of accounts) {
    const key = toUploadPostPlatform(account.platform);
    const payload = json[key ?? ""] ?? json[account.platform.toLowerCase()] ?? json[key === "twitter" ? "x" : ""];
    if (!payload || typeof payload !== "object") continue;
    const normalized = normalizeUploadPostAnalytics(payload);
    await prisma.socialMetricSnapshot.create({
      data: {
        socialAccountId: account.id,
        capturedAt: now,
        followers: normalized.followers ?? 0,
        views: normalized.views ?? 0,
        likes: normalized.likes ?? 0,
        comments: normalized.comments ?? 0,
        shares: normalized.shares ?? 0,
        posts: normalized.posts ?? 0,
        engagement: normalized.engagement ?? 0,
        rawPayload: { available: normalized.available, source: "upload-post" },
      },
    });
    await prisma.socialAccount.update({
      where: { id: account.id },
      data: { lastSyncAt: now },
    });
  }
  await recordSocialUsage({ workspaceId, kind: "analytics_sync", reference: profile.username });
  return accounts;
}

export async function syncUploadPostPostAnalytics(workspaceId: string, publicationId: string) {
  const publication = await prisma.socialPublication.findFirst({
    where: { id: publicationId, workspaceId, provider: "UPLOAD_POST" },
    include: { targets: true },
  });
  if (!publication?.providerPublicationId) return;
  const json = await uploadPostJson<Record<string, unknown>>({
    method: "GET",
    path: `/uploadposts/post-analytics/${encodeURIComponent(publication.providerPublicationId)}`,
  }).catch(() => null);
  if (!json) return;
  const now = new Date();
  const platforms = asRecord(json.platforms) ?? asRecord(json.results) ?? json;
  for (const target of publication.targets) {
    const key = toUploadPostPlatform(target.platform);
    const row =
      (key && asRecord(platforms)?.[key]) ||
      (key === "twitter" ? asRecord(platforms)?.x : null) ||
      (Array.isArray(json.results)
        ? (json.results as Array<Record<string, unknown>>).find((item) => fromUploadPostPlatform(String(item.platform ?? "")) === target.platform)
        : null);
    if (!row || typeof row !== "object") continue;
    const metric = row as Record<string, unknown>;
    const views = num(metric.views) ?? num(metric.impressions);
    const likes = num(metric.likes);
    const comments = num(metric.comments);
    const shares = num(metric.shares);
    await prisma.socialPostMetricSnapshot.create({
      data: {
        socialAccountId: target.socialAccountId,
        targetId: target.id,
        externalPostId: target.externalPostId ?? publication.providerPublicationId,
        capturedAt: now,
        views: views ?? 0,
        likes: likes ?? 0,
        comments: comments ?? 0,
        shares: shares ?? 0,
        engagement: views && views > 0 ? ((likes ?? 0) + (comments ?? 0) + (shares ?? 0)) / views * 100 : 0,
        rawPayload: {
          available: {
            views: views != null,
            likes: likes != null,
            comments: comments != null,
            shares: shares != null,
          },
          source: "upload-post",
        },
      },
    });
    await prisma.socialPublicationTarget.update({
      where: { id: target.id },
      data: {
        views: views ?? target.views,
        likes: likes ?? target.likes,
        comments: comments ?? target.comments,
        shares: shares ?? target.shares,
      },
    });
  }
}

export async function syncDueUploadPostAnalytics() {
  const profiles = await prisma.uploadPostProfile.findMany({
    where: { status: "ACTIVE" },
    take: 20,
  });
  for (const profile of profiles) {
    await syncUploadPostAnalytics(profile.workspaceId).catch(() => undefined);
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}
