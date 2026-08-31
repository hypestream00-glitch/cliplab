import { prisma } from "@/lib/db/prisma";
import { classifyCreditTransaction } from "@/lib/data/classify";
import { isDemoDataEnabled } from "@/lib/data/demo-mode";

export async function getDisplayCredits(workspaceId: string) {
  const [balance, transactions] = await Promise.all([
    prisma.creditBalance.findUnique({ where: { workspaceId } }),
    prisma.creditTransaction.findMany({
      where: { workspaceId },
      orderBy: { createdAt: "desc" },
      take: 40,
    }),
  ]);
  if (isDemoDataEnabled()) {
    const periodUsed = transactions.filter((item) => item.amount < 0).reduce((sum, item) => sum + Math.abs(item.amount), 0);
    return { available: balance?.available ?? 0, transactions, periodUsed };
  }
  const visible = transactions.filter((item) => classifyCreditTransaction(item) !== "DEMO");
  const hasRealGrant = visible.some((item) => item.amount > 0);
  const periodUsed = visible.filter((item) => item.amount < 0).reduce((sum, item) => sum + Math.abs(item.amount), 0);
  return {
    available: hasRealGrant ? (balance?.available ?? 0) : null,
    transactions: visible,
    periodUsed,
  };
}
