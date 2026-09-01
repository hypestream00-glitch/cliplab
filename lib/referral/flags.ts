import { prisma } from "@/lib/db/prisma";
import { RAPID_CONVERSION_REVIEW_THRESHOLD } from "@/lib/referral/config";
import type { Prisma } from "@/generated/prisma/client";

type Db = Prisma.TransactionClient | typeof prisma;

export async function maybeFlagRapidConversions(userId: string, tx?: Db) {
  const db = tx ?? prisma;
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const recent = await db.referralReward.count({
    where: { referrerUserId: userId, createdAt: { gte: since } },
  });
  if (recent < RAPID_CONVERSION_REVIEW_THRESHOLD) return null;
  return db.affiliateFlag.create({
    data: {
      userId,
      status: "REVIEW",
      reason: "RAPID_CONVERSIONS",
      metadata: { recent24h: recent },
    },
  });
}

export async function flagAffiliateReview(params: {
  userId: string;
  reason: string;
  metadata?: Record<string, unknown>;
}) {
  return prisma.affiliateFlag.create({
    data: {
      userId: params.userId,
      status: "REVIEW",
      reason: params.reason,
      metadata: (params.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
    },
  });
}
