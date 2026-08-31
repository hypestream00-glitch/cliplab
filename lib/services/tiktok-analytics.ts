import { prisma } from "@/lib/db/prisma";
import { getSocialProvider } from "@/lib/social";
import { getUsableAccessToken } from "@/lib/services/social-accounts";
import { logger } from "@/lib/logger";
import type { SocialAccount } from "@/generated/prisma/client";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function syncTikTokAccountMetrics(account: SocialAccount) {
  if (account.platform !== "TIKTOK") return;
  const provider = getSocialProvider("TIKTOK");
  const token = await getUsableAccessToken(account);
  const metrics = await provider.getMetrics({ accessToken: token });
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
      engagement: metrics.views && metrics.views > 0
        ? ((metrics.likes ?? 0) + (metrics.comments ?? 0) + (metrics.shares ?? 0)) / metrics.views * 100
        : 0,
      rawPayload: {
        available: metrics.available,
        raw: metrics.raw ?? null,
      },
    },
  });
  await prisma.socialAccount.update({
    where: { id: account.id },
    data: { lastSyncAt: new Date(), status: "CONNECTED" },
  });
  return metrics;
}

export async function syncTikTokPostMetrics() {
  const targets = await prisma.socialPublicationTarget.findMany({
    where: {
      platform: "TIKTOK",
      status: "PUBLISHED",
      externalPostId: { not: null },
      socialAccount: { mock: false, status: { in: ["CONNECTED", "TOKEN_EXPIRING"] } },
    },
    include: { socialAccount: true },
    take: 40,
  });
  for (const target of targets) {
    try {
      const token = await getUsableAccessToken(target.socialAccount);
      const response = await fetch(
        `https://open.tiktokapis.com/v2/video/query/?fields=${encodeURIComponent("id,view_count,like_count,comment_count,share_count")}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ filters: { video_ids: [target.externalPostId] } }),
        },
      );
      if (response.status === 429) {
        await sleep(5000);
        continue;
      }
      const json = (await response.json().catch(() => ({}))) as {
        error?: { code?: string };
        data?: { videos?: Array<{ view_count?: number; like_count?: number; comment_count?: number; share_count?: number }> };
      };
      if (json.error?.code && json.error.code !== "ok") continue;
      const video = json.data?.videos?.[0];
      if (!video) {
        await prisma.socialPostMetricSnapshot.create({
          data: {
            socialAccountId: target.socialAccountId,
            targetId: target.id,
            externalPostId: target.externalPostId!,
            capturedAt: new Date(),
            views: 0,
            likes: 0,
            comments: 0,
            shares: 0,
            engagement: 0,
            rawPayload: { available: false, reason: "video.list/query sem este post (pode ser privado ou sem escopo)" },
          },
        });
        continue;
      }
      const views = Number(video.view_count ?? 0);
      const likes = Number(video.like_count ?? 0);
      const comments = Number(video.comment_count ?? 0);
      const shares = Number(video.share_count ?? 0);
      await prisma.socialPublicationTarget.update({
        where: { id: target.id },
        data: { views, likes, comments, shares },
      });
      await prisma.socialPostMetricSnapshot.create({
        data: {
          socialAccountId: target.socialAccountId,
          targetId: target.id,
          externalPostId: target.externalPostId!,
          capturedAt: new Date(),
          views,
          likes,
          comments,
          shares,
          engagement: views ? ((likes + comments + shares) / views) * 100 : 0,
          rawPayload: { video, available: true },
        },
      });
    } catch (error) {
      logger.warn({ err: error, targetId: target.id }, "tiktok post metric sync skipped");
    }
  }
}

export async function syncDueTikTokAnalytics() {
  const cutoff = new Date(Date.now() - 15 * 60 * 1000);
  const accounts = await prisma.socialAccount.findMany({
    where: {
      platform: "TIKTOK",
      mock: false,
      status: { in: ["CONNECTED", "TOKEN_EXPIRING"] },
      OR: [{ lastSyncAt: null }, { lastSyncAt: { lt: cutoff } }],
    },
    take: 10,
  });
  for (const account of accounts) {
    try {
      await syncTikTokAccountMetrics(account);
    } catch (error) {
      logger.warn({ err: error, accountId: account.id }, "tiktok account metric sync failed");
    }
  }
  await syncTikTokPostMetrics();
}
