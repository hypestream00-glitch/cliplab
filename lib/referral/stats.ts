import { prisma } from "@/lib/db/prisma";
import { MIN_WITHDRAWAL_CENTS, REFERRAL_MILESTONES } from "@/lib/referral/config";
import { extraMinuteSeconds } from "@/lib/referral/minutes";
import { walletBalance } from "@/lib/referral/wallet";

export function nextReferralMilestone(converted: number) {
  const target = REFERRAL_MILESTONES.find((item) => converted < item) ?? REFERRAL_MILESTONES[REFERRAL_MILESTONES.length - 1];
  const remaining = Math.max(0, target - converted);
  return {
    target,
    current: converted,
    remaining,
    ratio: Math.min(1, converted / target),
    complete: converted >= REFERRAL_MILESTONES[REFERRAL_MILESTONES.length - 1],
  };
}

export async function affiliateDashboard(userId: string, workspaceId: string) {
  const [invited, converted, clicks, rewards, withdrawals, balance, extraSeconds, received, minutes] = await Promise.all([
    prisma.referralAttribution.count({ where: { referrerUserId: userId } }),
    prisma.referralAttribution.count({ where: { referrerUserId: userId, convertedAt: { not: null } } }),
    prisma.referralClick.count({ where: { referrerUserId: userId } }),
    prisma.referralReward.findMany({
      where: { referrerUserId: userId },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.withdrawal.findMany({
      where: { userId },
      orderBy: { requestedAt: "desc" },
      take: 50,
      select: {
        id: true,
        amountCents: true,
        status: true,
        pixKeyType: true,
        pixKeyMasked: true,
        requestedAt: true,
        paidAt: true,
        rejectedAt: true,
        rejectionReason: true,
      },
    }),
    walletBalance(userId),
    extraMinuteSeconds(workspaceId),
    prisma.referralReward.aggregate({
      where: { referrerUserId: userId, status: { in: ["PENDING", "AVAILABLE"] } },
      _sum: { cashAmountCents: true, aiMinutes: true },
    }),
    prisma.minuteGrant.aggregate({
      where: { userId, source: "REFERRAL" },
      _sum: { seconds: true },
    }),
  ]);
  const withdrawn = await prisma.withdrawal.aggregate({
    where: { userId, status: "PAID" },
    _sum: { amountCents: true },
  });
  return {
    invited,
    converted,
    clicks,
    rewards,
    withdrawals,
    availableCents: balance.available,
    pendingCents: balance.pending,
    totalReceivedCents: received._sum.cashAmountCents ?? 0,
    totalWithdrawnCents: withdrawn._sum.amountCents ?? 0,
    minutesGranted: Math.round((minutes._sum.seconds ?? 0) / 60),
    extraSeconds,
    minWithdrawalCents: MIN_WITHDRAWAL_CENTS,
    milestone: nextReferralMilestone(converted),
  };
}
