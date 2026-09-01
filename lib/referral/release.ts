import { prisma } from "@/lib/db/prisma";
import { lockWalletUser, writeAuditLog } from "@/lib/referral/audit";
import { appendLedger, LEDGER_AVAILABLE, LEDGER_PENDING } from "@/lib/referral/wallet";

export async function releaseDueReferralRewards(limit = 50) {
  const due = await prisma.referralReward.findMany({
    where: {
      status: "PENDING",
      cashAmountCents: { gt: 0 },
      availableAt: { lte: new Date() },
    },
    orderBy: { availableAt: "asc" },
    take: limit,
  });
  let released = 0;
  for (const reward of due) {
    const ok = await releaseReferralReward(reward.id);
    if (ok) released += 1;
  }
  return { released, scanned: due.length };
}

export async function releaseReferralReward(rewardId: string) {
  return prisma.$transaction(async (tx) => {
    const reward = await tx.referralReward.findUnique({ where: { id: rewardId } });
    if (!reward || reward.status !== "PENDING") return false;
    if (reward.availableAt && reward.availableAt.getTime() > Date.now()) return false;
    await lockWalletUser(tx, reward.referrerUserId);
    const again = await tx.referralReward.findUnique({ where: { id: rewardId } });
    if (!again || again.status !== "PENDING") return false;
    await appendLedger(tx, {
      userId: again.referrerUserId,
      type: "REFERRAL_AVAILABLE",
      amountCents: -again.cashAmountCents,
      balanceKind: LEDGER_PENDING,
      idempotencyKey: `reward-release-pending:${again.id}`,
      referralRewardId: again.id,
    });
    await appendLedger(tx, {
      userId: again.referrerUserId,
      type: "REFERRAL_AVAILABLE",
      amountCents: again.cashAmountCents,
      balanceKind: LEDGER_AVAILABLE,
      idempotencyKey: `reward-release-available:${again.id}`,
      referralRewardId: again.id,
    });
    await tx.referralReward.update({
      where: { id: again.id },
      data: { status: "AVAILABLE" },
    });
    await writeAuditLog(
      {
        action: "REFERRAL_REWARD_AVAILABLE",
        entityType: "ReferralReward",
        entityId: again.id,
        userId: again.referrerUserId,
        workspaceId: again.workspaceId,
        metadata: { cashAmountCents: again.cashAmountCents },
      },
      tx,
    );
    return true;
  });
}
