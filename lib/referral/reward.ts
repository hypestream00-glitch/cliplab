import { prisma } from "@/lib/db/prisma";
import { isPrismaUniqueViolation } from "@/lib/webhooks/idempotency";
import { applyPlanGrant } from "@/lib/billing/grants";
import { productPlanCode } from "@/lib/config/plans";
import { sendReferralRewardEmail } from "@/lib/email/send";
import { logger } from "@/lib/logger";

const REWARD_DAYS = 7;

export type ReferralRewardResult =
  | { ok: true; rewardId: string; days: number; duplicate?: boolean }
  | { ok: false; reason: "not-paid" | "no-attribution" | "no-referrer-workspace" };

export async function maybeGrantReferralReward(params: {
  referredWorkspaceId: string;
  stripeEventId: string;
  stripeInvoiceId?: string | null;
  paidAmount: number;
  planCode: string;
}): Promise<ReferralRewardResult> {
  if (params.paidAmount <= 0) return { ok: false, reason: "not-paid" };
  if (productPlanCode(params.planCode) === "FREE") return { ok: false, reason: "not-paid" };

  const owner = await prisma.workspaceMember.findFirst({
    where: { workspaceId: params.referredWorkspaceId, role: "OWNER" },
    select: { userId: true },
  });
  if (!owner) return { ok: false, reason: "no-attribution" };

  const attribution = await prisma.referralAttribution.findUnique({
    where: { referredUserId: owner.userId },
  });
  if (!attribution) return { ok: false, reason: "no-attribution" };

  const existing = await prisma.referralReward.findUnique({
    where: { attributionId: attribution.id },
  });
  if (existing) return { ok: true, rewardId: existing.id, days: existing.days, duplicate: true };

  const byEvent = params.stripeEventId
    ? await prisma.referralReward.findUnique({ where: { stripeEventId: params.stripeEventId } })
    : null;
  if (byEvent) return { ok: true, rewardId: byEvent.id, days: byEvent.days, duplicate: true };

  const referrerWorkspace = await prisma.workspaceMember.findFirst({
    where: { userId: attribution.referrerUserId, role: "OWNER" },
    orderBy: { createdAt: "asc" },
    select: { workspaceId: true },
  });
  if (!referrerWorkspace) return { ok: false, reason: "no-referrer-workspace" };

  try {
    const grant = await applyPlanGrant({
      workspaceId: referrerWorkspace.workspaceId,
      userId: attribution.referrerUserId,
      source: "REFERRAL",
      sourceKey: attribution.id,
      planCode: "PRO",
      days: REWARD_DAYS,
    });
    const reward = await prisma.referralReward.create({
      data: {
        attributionId: attribution.id,
        referrerUserId: attribution.referrerUserId,
        referredUserId: attribution.referredUserId,
        workspaceId: referrerWorkspace.workspaceId,
        grantId: grant.id,
        stripeEventId: params.stripeEventId,
        stripeInvoiceId: params.stripeInvoiceId ?? null,
        days: REWARD_DAYS,
        status: "GRANTED",
      },
    });
    await prisma.referralAttribution.update({
      where: { id: attribution.id },
      data: { convertedAt: new Date() },
    });
    const referrer = await prisma.user.findUnique({
      where: { id: attribution.referrerUserId },
      select: { id: true, email: true, name: true },
    });
    if (referrer?.email) {
      await sendReferralRewardEmail({
        to: referrer.email,
        userId: referrer.id,
        name: referrer.name,
        rewardId: reward.id,
      }).catch((error) => {
        logger.warn({ errType: error instanceof Error ? error.name : "Error" }, "EMAIL REFERRAL REWARD QUEUE FAILED");
      });
    }
    return { ok: true, rewardId: reward.id, days: REWARD_DAYS };
  } catch (error) {
    if (isPrismaUniqueViolation(error)) {
      const again = await prisma.referralReward.findUnique({ where: { attributionId: attribution.id } });
      if (again) return { ok: true, rewardId: again.id, days: again.days, duplicate: true };
    }
    throw error;
  }
}

export async function referralStats(userId: string) {
  const [invited, converted, rewards] = await Promise.all([
    prisma.referralAttribution.count({ where: { referrerUserId: userId } }),
    prisma.referralAttribution.count({ where: { referrerUserId: userId, convertedAt: { not: null } } }),
    prisma.referralReward.aggregate({
      where: { referrerUserId: userId, status: "GRANTED" },
      _sum: { days: true },
    }),
  ]);
  return {
    invited,
    converted,
    rewardDays: rewards._sum.days ?? 0,
  };
}
