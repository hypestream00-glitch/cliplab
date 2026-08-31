import { prisma } from "@/lib/db/prisma";
import { getUsableAccessToken } from "@/lib/services/social-accounts";
import { xProvider, fetchXTweetMetrics } from "@/lib/social/x/provider";
import { logger } from "@/lib/logger";
import type { Prisma, SocialAccount } from "@/generated/prisma/client";

export async function syncXAccountMetrics(account: SocialAccount) {
  if (account.platform !== "X" || account.mock) return;
  const token = await getUsableAccessToken(account);
  const metrics = await xProvider.getMetrics({ accessToken: token });
  await prisma.socialMetricSnapshot.create({
    data: {
      socialAccountId: account.id,
      capturedAt: new Date(),
      followers: metrics.followers ?? 0,
      views: 0,
      likes: 0,
      comments: 0,
      shares: 0,
      posts: metrics.posts ?? 0,
      engagement: 0,
      rawPayload: { available: metrics.available, raw: metrics.raw ?? null } as Prisma.InputJsonValue,
    },
  });
  await prisma.socialAccount.update({ where: { id: account.id }, data: { lastSyncAt: new Date(), status: "CONNECTED" } });
}

export async function syncXPostMetrics() {
  const targets = await prisma.socialPublicationTarget.findMany({
    where: {
      platform: "X",
      status: "PUBLISHED",
      externalPostId: { not: null },
      socialAccount: { mock: false, status: { in: ["CONNECTED", "TOKEN_EXPIRING"] } },
    },
    include: { socialAccount: true },
    take: 20,
  });
  for (const target of targets) {
    try {
      const token = await getUsableAccessToken(target.socialAccount);
      const metrics = await fetchXTweetMetrics(token, target.externalPostId!);
      await prisma.socialPublicationTarget.update({
        where: { id: target.id },
        data: {
          views: metrics.views ?? 0,
          likes: metrics.likes ?? 0,
          comments: metrics.comments ?? 0,
          shares: metrics.shares ?? 0,
        },
      });
      await prisma.socialPostMetricSnapshot.create({
        data: {
          socialAccountId: target.socialAccountId,
          targetId: target.id,
          externalPostId: target.externalPostId!,
          capturedAt: new Date(),
          views: metrics.views ?? 0,
          likes: metrics.likes ?? 0,
          comments: metrics.comments ?? 0,
          shares: metrics.shares ?? 0,
          engagement: 0,
          rawPayload: { available: metrics.available, raw: metrics.raw } as Prisma.InputJsonValue,
        },
      });
    } catch (error) {
      logger.warn({ err: error, targetId: target.id }, "x post metric sync skipped");
    }
  }
}

export async function syncDueXAnalytics() {
  const cutoff = new Date(Date.now() - 15 * 60 * 1000);
  const accounts = await prisma.socialAccount.findMany({
    where: {
      platform: "X",
      mock: false,
      status: { in: ["CONNECTED", "TOKEN_EXPIRING"] },
      OR: [{ lastSyncAt: null }, { lastSyncAt: { lt: cutoff } }],
    },
    take: 10,
  });
  for (const account of accounts) {
    try {
      await syncXAccountMetrics(account);
    } catch (error) {
      logger.warn({ err: error, accountId: account.id }, "x account metric sync failed");
    }
  }
  await syncXPostMetrics();
}
