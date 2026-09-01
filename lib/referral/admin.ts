import { prisma } from "@/lib/db/prisma";
import { decryptSecret } from "@/lib/security/crypto";
import { isPixKeyType, type PixKeyType } from "@/lib/referral/pix";
import { walletBalance } from "@/lib/referral/wallet";

export async function adminAffiliateSummary() {
  const [affiliates, attributions, conversions, pending, available, paid] = await Promise.all([
    prisma.referralProfile.count(),
    prisma.referralAttribution.count(),
    prisma.referralAttribution.count({ where: { convertedAt: { not: null } } }),
    prisma.walletLedgerEntry.aggregate({
      where: { balanceKind: "PENDING" },
      _sum: { amountCents: true },
    }),
    prisma.walletLedgerEntry.aggregate({
      where: { balanceKind: "AVAILABLE" },
      _sum: { amountCents: true },
    }),
    prisma.withdrawal.aggregate({
      where: { status: "PAID" },
      _sum: { amountCents: true },
    }),
  ]);
  return {
    affiliates,
    attributions,
    conversions,
    pendingCents: pending._sum.amountCents ?? 0,
    availableCents: available._sum.amountCents ?? 0,
    paidCents: paid._sum.amountCents ?? 0,
  };
}

export async function adminAffiliateRows(take = 80) {
  const profiles = await prisma.referralProfile.findMany({
    take,
    orderBy: { createdAt: "desc" },
    include: {
      user: { select: { id: true, name: true, email: true } },
    },
  });
  const userIds = profiles.map((row) => row.userId);
  const [attributions, conversions, withdrawals, flags] = await Promise.all([
    prisma.referralAttribution.groupBy({
      by: ["referrerUserId"],
      where: { referrerUserId: { in: userIds } },
      _count: { _all: true },
    }),
    prisma.referralAttribution.groupBy({
      by: ["referrerUserId"],
      where: { referrerUserId: { in: userIds }, convertedAt: { not: null } },
      _count: { _all: true },
    }),
    prisma.withdrawal.groupBy({
      by: ["userId"],
      where: { userId: { in: userIds } },
      _count: { _all: true },
    }),
    prisma.affiliateFlag.findMany({
      where: { userId: { in: userIds }, status: "REVIEW", resolvedAt: null },
      select: { userId: true },
    }),
  ]);
  const invitedMap = new Map(attributions.map((row) => [row.referrerUserId, row._count._all]));
  const convertedMap = new Map(conversions.map((row) => [row.referrerUserId, row._count._all]));
  const withdrawalMap = new Map(withdrawals.map((row) => [row.userId, row._count._all]));
  const review = new Set(flags.map((row) => row.userId));
  const balances = await Promise.all(userIds.map(async (id) => [id, await walletBalance(id)] as const));
  const balanceMap = new Map(balances);
  return profiles.map((row) => ({
    userId: row.userId,
    name: row.user.name,
    email: row.user.email,
    code: row.code,
    invited: invitedMap.get(row.userId) ?? 0,
    converted: convertedMap.get(row.userId) ?? 0,
    withdrawals: withdrawalMap.get(row.userId) ?? 0,
    availableCents: balanceMap.get(row.userId)?.available ?? 0,
    pendingCents: balanceMap.get(row.userId)?.pending ?? 0,
    status: review.has(row.userId) ? "REVIEW" : "NORMAL",
  }));
}

export function revealPixKey(cipher: string) {
  return decryptSecret(cipher);
}

export function pixTypeLabel(type: string) {
  if (!isPixKeyType(type)) return type;
  const labels: Record<PixKeyType, string> = {
    CPF: "CPF",
    CNPJ: "CNPJ",
    EMAIL: "E-mail",
    PHONE: "Telefone",
    EVP: "Chave aleatória",
  };
  return labels[type];
}
