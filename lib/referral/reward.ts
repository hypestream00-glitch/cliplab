import { prisma } from "@/lib/db/prisma";
import { isPrismaUniqueViolation } from "@/lib/webhooks/idempotency";
import { productPlanCode } from "@/lib/config/plans";
import { sendReferralRewardEmail } from "@/lib/email/send";
import { logger } from "@/lib/logger";
import { lockWalletUser, writeAuditLog } from "@/lib/referral/audit";
import { REFERRAL_AI_MINUTES, REFERRAL_CASH_CENTS, referralHoldUntil } from "@/lib/referral/config";
import { maybeFlagRapidConversions } from "@/lib/referral/flags";
import { grantReferralMinutes } from "@/lib/referral/minutes";
import { appendLedger, LEDGER_PENDING } from "@/lib/referral/wallet";

export type ReferralRewardResult =
  | { ok: true; rewardId: string; cashAmountCents: number; aiMinutes: number; days: number; duplicate?: boolean }
  | { ok: false; reason: "not-paid" | "no-attribution" | "no-referrer-workspace" };

export async function maybeGrantReferralReward(params: {
  referredWorkspaceId: string;
  stripeEventId: string;
  stripeInvoiceId?: string | null;
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
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
  if (attribution.referrerUserId === attribution.referredUserId) {
    return { ok: false, reason: "no-attribution" };
  }

  const existing = await prisma.referralReward.findUnique({
    where: { attributionId: attribution.id },
  });
  if (existing) {
    return {
      ok: true,
      rewardId: existing.id,
      cashAmountCents: existing.cashAmountCents,
      aiMinutes: existing.aiMinutes,
      days: existing.days,
      duplicate: true,
    };
  }

  const byEvent = params.stripeEventId
    ? await prisma.referralReward.findUnique({ where: { stripeEventId: params.stripeEventId } })
    : null;
  if (byEvent) {
    return {
      ok: true,
      rewardId: byEvent.id,
      cashAmountCents: byEvent.cashAmountCents,
      aiMinutes: byEvent.aiMinutes,
      days: byEvent.days,
      duplicate: true,
    };
  }

  const referrerWorkspace = await prisma.workspaceMember.findFirst({
    where: { userId: attribution.referrerUserId, role: "OWNER" },
    orderBy: { createdAt: "asc" },
    select: { workspaceId: true },
  });
  if (!referrerWorkspace) return { ok: false, reason: "no-referrer-workspace" };

  try {
    const reward = await prisma.$transaction(async (tx) => {
      await lockWalletUser(tx, attribution.referrerUserId);
      const again = await tx.referralReward.findUnique({ where: { attributionId: attribution.id } });
      if (again) return again;
      const created = await tx.referralReward.create({
        data: {
          attributionId: attribution.id,
          referrerUserId: attribution.referrerUserId,
          referredUserId: attribution.referredUserId,
          workspaceId: referrerWorkspace.workspaceId,
          stripeEventId: params.stripeEventId,
          stripeInvoiceId: params.stripeInvoiceId ?? null,
          stripeCustomerId: params.stripeCustomerId ?? null,
          stripeSubscriptionId: params.stripeSubscriptionId ?? null,
          days: 0,
          cashAmountCents: REFERRAL_CASH_CENTS,
          aiMinutes: REFERRAL_AI_MINUTES,
          rewardType: "FIRST_PAID_SUBSCRIPTION",
          status: "PENDING",
          reviewStatus: "NORMAL",
          availableAt: referralHoldUntil(),
        },
      });
      await appendLedger(tx, {
        userId: attribution.referrerUserId,
        type: "REFERRAL_PENDING",
        amountCents: REFERRAL_CASH_CENTS,
        balanceKind: LEDGER_PENDING,
        idempotencyKey: `reward-pending:${created.id}`,
        referralRewardId: created.id,
      });
      await grantReferralMinutes(tx, {
        workspaceId: referrerWorkspace.workspaceId,
        userId: attribution.referrerUserId,
        rewardId: created.id,
      });
      await tx.referralAttribution.update({
        where: { id: attribution.id },
        data: { convertedAt: new Date() },
      });
      await writeAuditLog(
        {
          action: "REFERRAL_REWARD_CREATED",
          entityType: "ReferralReward",
          entityId: created.id,
          userId: attribution.referrerUserId,
          workspaceId: referrerWorkspace.workspaceId,
          metadata: {
            cashAmountCents: REFERRAL_CASH_CENTS,
            aiMinutes: REFERRAL_AI_MINUTES,
            stripeEventId: params.stripeEventId,
            referredUserId: attribution.referredUserId,
          },
        },
        tx,
      );
      await maybeFlagRapidConversions(attribution.referrerUserId, tx);
      return created;
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
    return {
      ok: true,
      rewardId: reward.id,
      cashAmountCents: reward.cashAmountCents || REFERRAL_CASH_CENTS,
      aiMinutes: reward.aiMinutes || REFERRAL_AI_MINUTES,
      days: 0,
      duplicate: Boolean(existing),
    };
  } catch (error) {
    if (isPrismaUniqueViolation(error)) {
      const again = await prisma.referralReward.findUnique({ where: { attributionId: attribution.id } });
      if (again) {
        return {
          ok: true,
          rewardId: again.id,
          cashAmountCents: again.cashAmountCents,
          aiMinutes: again.aiMinutes,
          days: again.days,
          duplicate: true,
        };
      }
    }
    throw error;
  }
}

export async function referralStats(userId: string) {
  const [invited, converted, walletPending, walletAvailable] = await Promise.all([
    prisma.referralAttribution.count({ where: { referrerUserId: userId } }),
    prisma.referralAttribution.count({ where: { referrerUserId: userId, convertedAt: { not: null } } }),
    prisma.walletLedgerEntry.aggregate({
      where: { userId, balanceKind: "PENDING" },
      _sum: { amountCents: true },
    }),
    prisma.walletLedgerEntry.aggregate({
      where: { userId, balanceKind: "AVAILABLE" },
      _sum: { amountCents: true },
    }),
  ]);
  return {
    invited,
    converted,
    rewardDays: 0,
    pendingCents: walletPending._sum.amountCents ?? 0,
    availableCents: walletAvailable._sum.amountCents ?? 0,
  };
}
