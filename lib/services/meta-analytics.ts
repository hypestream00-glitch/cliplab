import { prisma } from "@/lib/db/prisma";
import { getUsableAccessToken } from "@/lib/services/social-accounts";
import { instagramProvider } from "@/lib/social/meta/instagram";
import { facebookProvider } from "@/lib/social/meta/facebook";
import { META_GRAPH_BASE } from "@/lib/social/meta/config";
import { metaFetch } from "@/lib/social/meta/http";
import { logger } from "@/lib/logger";
import type { MetaProviderMeta } from "@/lib/social/meta/types";
import type { SocialAccount } from "@/generated/prisma/client";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function meta(account: SocialAccount): MetaProviderMeta {
  return (account.providerMeta ?? {}) as MetaProviderMeta;
}

export async function syncInstagramAccountMetrics(account: SocialAccount) {
  if (account.platform !== "INSTAGRAM" || account.mock) return;
  const token = await getUsableAccessToken(account);
  const igUserId = meta(account).igUserId ?? account.externalAccountId;
  const metrics = await instagramProvider.getMetrics({ accessToken: token, igUserId });
  await prisma.socialMetricSnapshot.create({
    data: {
      socialAccountId: account.id,
      capturedAt: new Date(),
      followers: metrics.followers ?? 0,
      views: metrics.views ?? 0,
      likes: metrics.likes ?? 0,
      comments: metrics.comments ?? 0,
      shares: metrics.shares ?? 0,
      posts: metrics.posts ?? 0,
      engagement: 0,
      rawPayload: { available: metrics.available, raw: metrics.raw ?? null },
    },
  });
  await prisma.socialAccount.update({ where: { id: account.id }, data: { lastSyncAt: new Date(), status: "CONNECTED" } });
}

export async function syncFacebookAccountMetrics(account: SocialAccount) {
  if (account.platform !== "FACEBOOK" || account.mock) return;
  const token = await getUsableAccessToken(account);
  const pageId = meta(account).pageId ?? account.externalAccountId;
  const metrics = await facebookProvider.getMetrics({ accessToken: token, pageId });
  await prisma.socialMetricSnapshot.create({
    data: {
      socialAccountId: account.id,
      capturedAt: new Date(),
      followers: metrics.followers ?? 0,
      views: 0,
      likes: 0,
      comments: 0,
      shares: 0,
      posts: 0,
      engagement: 0,
      rawPayload: { available: metrics.available, raw: metrics.raw ?? null },
    },
  });
  await prisma.socialAccount.update({ where: { id: account.id }, data: { lastSyncAt: new Date(), status: "CONNECTED" } });
}

export async function syncMetaPostMetrics() {
  const targets = await prisma.socialPublicationTarget.findMany({
    where: {
      platform: { in: ["INSTAGRAM", "FACEBOOK"] },
      status: "PUBLISHED",
      externalPostId: { not: null },
      socialAccount: { mock: false, status: { in: ["CONNECTED", "TOKEN_EXPIRING"] } },
    },
    include: { socialAccount: true },
    take: 30,
  });
  for (const target of targets) {
    try {
      const token = await getUsableAccessToken(target.socialAccount);
      if (target.platform === "INSTAGRAM") {
        await syncIgMedia(target.socialAccountId, target.id, target.externalPostId!, token);
      } else {
        await syncFbVideo(target.socialAccountId, target.id, target.externalPostId!, token);
      }
    } catch (error) {
      logger.warn({ err: error, targetId: target.id }, "meta post metric sync skipped");
    }
  }
}

async function syncIgMedia(socialAccountId: string, targetId: string, mediaId: string, token: string) {
  const response = await metaFetch(
    `${META_GRAPH_BASE}/${encodeURIComponent(mediaId)}/insights?metric=views,reach,likes,comments,saved,shares`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (response.status === 429) {
    await sleep(5000);
    return;
  }
  const json = (await response.json().catch(() => ({}))) as {
    error?: { code?: number };
    data?: Array<{ name?: string; values?: Array<{ value?: number }> }>;
  };
  if (json.error) {
    await prisma.socialPostMetricSnapshot.create({
      data: {
        socialAccountId,
        targetId,
        externalPostId: mediaId,
        capturedAt: new Date(),
        views: 0,
        likes: 0,
        comments: 0,
        shares: 0,
        engagement: 0,
        rawPayload: { available: false, reason: "instagram_manage_insights ausente ou métrica indisponível" },
      },
    });
    return;
  }
  const byName = Object.fromEntries((json.data ?? []).map((item) => [item.name ?? "", Number(item.values?.[0]?.value ?? 0)]));
  const views = byName.views ?? null;
  const likes = byName.likes ?? null;
  const comments = byName.comments ?? null;
  const shares = byName.shares ?? null;
  await prisma.socialPublicationTarget.update({
    where: { id: targetId },
    data: {
      views: views ?? 0,
      likes: likes ?? 0,
      comments: comments ?? 0,
      shares: shares ?? 0,
    },
  });
  await prisma.socialPostMetricSnapshot.create({
    data: {
      socialAccountId,
      targetId,
      externalPostId: mediaId,
      capturedAt: new Date(),
      views: views ?? 0,
      likes: likes ?? 0,
      comments: comments ?? 0,
      shares: shares ?? 0,
      engagement: views ? ((likes ?? 0) + (comments ?? 0) + (shares ?? 0)) / views * 100 : 0,
      rawPayload: { available: true, metrics: byName },
    },
  });
}

async function syncFbVideo(socialAccountId: string, targetId: string, videoId: string, token: string) {
  const response = await metaFetch(
    `${META_GRAPH_BASE}/${encodeURIComponent(videoId)}?fields=views,likes.summary(true),comments.summary(true)`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (response.status === 429) {
    await sleep(5000);
    return;
  }
  const json = (await response.json().catch(() => ({}))) as {
    error?: { code?: number };
    views?: number;
    likes?: { summary?: { total_count?: number } };
    comments?: { summary?: { total_count?: number } };
  };
  if (json.error) {
    await prisma.socialPostMetricSnapshot.create({
      data: {
        socialAccountId,
        targetId,
        externalPostId: videoId,
        capturedAt: new Date(),
        views: 0,
        likes: 0,
        comments: 0,
        shares: 0,
        engagement: 0,
        rawPayload: { available: false, reason: "insights da Página indisponíveis para este vídeo" },
      },
    });
    return;
  }
  const views = json.views != null ? Number(json.views) : null;
  const likes = json.likes?.summary?.total_count != null ? Number(json.likes.summary.total_count) : null;
  const comments = json.comments?.summary?.total_count != null ? Number(json.comments.summary.total_count) : null;
  await prisma.socialPublicationTarget.update({
    where: { id: targetId },
    data: { views: views ?? 0, likes: likes ?? 0, comments: comments ?? 0 },
  });
  await prisma.socialPostMetricSnapshot.create({
    data: {
      socialAccountId,
      targetId,
      externalPostId: videoId,
      capturedAt: new Date(),
      views: views ?? 0,
      likes: likes ?? 0,
      comments: comments ?? 0,
      shares: 0,
      engagement: views ? ((likes ?? 0) + (comments ?? 0)) / views * 100 : 0,
      rawPayload: { available: views != null || likes != null, video: { views, likes, comments } },
    },
  });
}

export async function syncDueMetaAnalytics() {
  const cutoff = new Date(Date.now() - 15 * 60 * 1000);
  const accounts = await prisma.socialAccount.findMany({
    where: {
      platform: { in: ["INSTAGRAM", "FACEBOOK"] },
      mock: false,
      status: { in: ["CONNECTED", "TOKEN_EXPIRING"] },
      OR: [{ lastSyncAt: null }, { lastSyncAt: { lt: cutoff } }],
    },
    take: 10,
  });
  for (const account of accounts) {
    try {
      if (account.platform === "INSTAGRAM") await syncInstagramAccountMetrics(account);
      else await syncFacebookAccountMetrics(account);
    } catch (error) {
      logger.warn({ err: error, accountId: account.id }, "meta account metric sync failed");
    }
  }
  await syncMetaPostMetrics();
}
