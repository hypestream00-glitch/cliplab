import { prisma } from "@/lib/db/prisma";
import { isPrismaUniqueViolation } from "@/lib/webhooks/idempotency";
import type { Prisma } from "@/generated/prisma/client";

export const LEDGER_PENDING = "PENDING";
export const LEDGER_AVAILABLE = "AVAILABLE";

export type LedgerKind = typeof LEDGER_PENDING | typeof LEDGER_AVAILABLE;

type Db = Prisma.TransactionClient | typeof prisma;

export class WalletNegativeError extends Error {
  constructor() {
    super("Saldo insuficiente");
    this.name = "WalletNegativeError";
  }
}

export function sumLedger(
  entries: Array<{ amountCents: number; balanceKind: string }>,
  kind: LedgerKind,
) {
  return entries.filter((row) => row.balanceKind === kind).reduce((sum, row) => sum + row.amountCents, 0);
}

export async function walletBalance(userId: string, tx?: Db) {
  const db = tx ?? prisma;
  const [pendingRow, availableRow] = await Promise.all([
    db.walletLedgerEntry.aggregate({
      where: { userId, balanceKind: LEDGER_PENDING },
      _sum: { amountCents: true },
    }),
    db.walletLedgerEntry.aggregate({
      where: { userId, balanceKind: LEDGER_AVAILABLE },
      _sum: { amountCents: true },
    }),
  ]);
  return {
    pending: pendingRow._sum.amountCents ?? 0,
    available: availableRow._sum.amountCents ?? 0,
  };
}

export async function appendLedger(
  tx: Db,
  params: {
    userId: string;
    type: string;
    amountCents: number;
    balanceKind: LedgerKind;
    idempotencyKey: string;
    referralRewardId?: string | null;
    withdrawalId?: string | null;
    reason?: string | null;
    metadata?: Record<string, unknown>;
  },
) {
  if (params.amountCents === 0) return { skipped: true as const, duplicate: false as const };
  const current = await walletBalance(params.userId, tx);
  const next =
    params.balanceKind === LEDGER_AVAILABLE
      ? current.available + params.amountCents
      : current.pending + params.amountCents;
  if (next < 0) throw new WalletNegativeError();
  try {
    await tx.walletLedgerEntry.create({
      data: {
        userId: params.userId,
        type: params.type,
        amountCents: params.amountCents,
        balanceKind: params.balanceKind,
        idempotencyKey: params.idempotencyKey,
        referralRewardId: params.referralRewardId ?? null,
        withdrawalId: params.withdrawalId ?? null,
        reason: params.reason ?? null,
        metadata: params.metadata as Prisma.InputJsonValue | undefined,
      },
    });
    return { skipped: false as const, duplicate: false as const };
  } catch (error) {
    if (isPrismaUniqueViolation(error)) return { skipped: true as const, duplicate: true as const };
    throw error;
  }
}
