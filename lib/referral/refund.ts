import { prisma } from "@/lib/db/prisma";
import { findWorkspaceForStripeCustomer } from "@/lib/billing/apply-subscription";
import { lockWalletUser, writeAuditLog } from "@/lib/referral/audit";
import { flagAffiliateReview } from "@/lib/referral/flags";
import { appendLedger, LEDGER_PENDING } from "@/lib/referral/wallet";

export async function maybeCancelReferralOnRefund(params: {
  stripeEventId: string;
  stripeCustomerId?: string | null;
  stripeInvoiceId?: string | null;
  stripeSubscriptionId?: string | null;
}) {
  const subscription = await findWorkspaceForStripeCustomer({
    stripeCustomerId: params.stripeCustomerId,
    stripeSubscriptionId: params.stripeSubscriptionId,
  });
  if (!subscription) return { ok: false as const, reason: "no-workspace" as const };

  const owner = await prisma.workspaceMember.findFirst({
    where: { workspaceId: subscription.workspaceId, role: "OWNER" },
    select: { userId: true },
  });
  if (!owner) return { ok: false as const, reason: "no-owner" as const };

  const reward = params.stripeInvoiceId
    ? await prisma.referralReward.findFirst({
        where: { referredUserId: owner.userId, stripeInvoiceId: params.stripeInvoiceId },
      })
    : params.stripeSubscriptionId
      ? await prisma.referralReward.findFirst({
          where: { referredUserId: owner.userId, stripeSubscriptionId: params.stripeSubscriptionId },
        })
      : null;
  if (!reward) return { ok: false as const, reason: "no-reward" as const };

  if (reward.status === "PENDING") {
    await cancelPendingReward(reward.id, params.stripeEventId);
    return { ok: true as const, cancelled: true as const, rewardId: reward.id };
  }

  if (reward.status === "AVAILABLE" && reward.reviewStatus !== "REVIEW") {
    await prisma.referralReward.update({
      where: { id: reward.id },
      data: { reviewStatus: "REVIEW" },
    });
    await flagAffiliateReview({
      userId: reward.referrerUserId,
      reason: "REFUND_AFTER_AVAILABLE",
      metadata: { rewardId: reward.id, stripeEventId: params.stripeEventId },
    });
    await writeAuditLog({
      action: "REFERRAL_REWARD_REVIEW",
      entityType: "ReferralReward",
      entityId: reward.id,
      userId: reward.referrerUserId,
      workspaceId: reward.workspaceId,
      metadata: { stripeEventId: params.stripeEventId, policy: "no-auto-negative" },
    });
  }
  return { ok: true as const, cancelled: false as const, rewardId: reward.id };
}

export async function cancelPendingReward(rewardId: string, stripeEventId?: string) {
  return prisma.$transaction(async (tx) => {
    const reward = await tx.referralReward.findUnique({ where: { id: rewardId } });
    if (!reward || reward.status !== "PENDING") return false;
    await lockWalletUser(tx, reward.referrerUserId);
    const again = await tx.referralReward.findUnique({ where: { id: rewardId } });
    if (!again || again.status !== "PENDING") return false;
    await appendLedger(tx, {
      userId: again.referrerUserId,
      type: "REFERRAL_CANCELLED",
      amountCents: -again.cashAmountCents,
      balanceKind: LEDGER_PENDING,
      idempotencyKey: `reward-cancel:${again.id}`,
      referralRewardId: again.id,
      reason: "refund_or_dispute",
      metadata: { stripeEventId },
    });
    await tx.referralReward.update({
      where: { id: again.id },
      data: { status: "CANCELLED", cancelledAt: new Date() },
    });
    await writeAuditLog(
      {
        action: "REFERRAL_REWARD_CANCELLED",
        entityType: "ReferralReward",
        entityId: again.id,
        userId: again.referrerUserId,
        workspaceId: again.workspaceId,
        metadata: { cashAmountCents: again.cashAmountCents, stripeEventId },
      },
      tx,
    );
    return true;
  });
}
