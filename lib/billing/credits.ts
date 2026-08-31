import { prisma } from "@/lib/db/prisma";
import type { CreditTransactionType } from "@/generated/prisma/client";
import { isPrismaUniqueViolation } from "@/lib/webhooks/idempotency";

export class InsufficientCreditsError extends Error {
  constructor() {
    super("Créditos insuficientes");
    this.name = "InsufficientCreditsError";
  }
}

export async function getAvailableCredits(workspaceId: string) {
  const balance = await prisma.creditBalance.findUnique({ where: { workspaceId } });
  return balance?.available ?? 0;
}

async function existingBalanceForKey(workspaceId: string, idempotencyKey: string) {
  const existing = await prisma.creditTransaction.findUnique({ where: { idempotencyKey } });
  if (!existing) return null;
  const balance = await prisma.creditBalance.findUnique({ where: { workspaceId } });
  return balance?.available ?? 0;
}

export async function grantCredits(params: {
  workspaceId: string;
  amount: number;
  type: CreditTransactionType;
  description: string;
  expiresAt?: Date;
  idempotencyKey?: string;
  reference?: string;
}) {
  if (params.amount <= 0) throw new Error("Amount must be positive");
  try {
    return await prisma.$transaction(async (tx) => {
      if (params.idempotencyKey) {
        const existing = await tx.creditTransaction.findUnique({ where: { idempotencyKey: params.idempotencyKey } });
        if (existing) {
          const balance = await tx.creditBalance.findUnique({ where: { workspaceId: params.workspaceId } });
          return balance?.available ?? 0;
        }
      }
      await tx.creditBatch.create({
        data: {
          workspaceId: params.workspaceId,
          amount: params.amount,
          remaining: params.amount,
          type: params.type,
          expiresAt: params.expiresAt,
        },
      });
      const balance = await tx.creditBalance.upsert({
        where: { workspaceId: params.workspaceId },
        create: { workspaceId: params.workspaceId, available: params.amount },
        update: { available: { increment: params.amount } },
      });
      await tx.creditTransaction.create({
        data: {
          workspaceId: params.workspaceId,
          type: params.type,
          amount: params.amount,
          description: params.description,
          reference: params.reference,
          idempotencyKey: params.idempotencyKey,
        },
      });
      return balance.available;
    });
  } catch (error) {
    if (params.idempotencyKey && isPrismaUniqueViolation(error)) {
      const recovered = await existingBalanceForKey(params.workspaceId, params.idempotencyKey);
      if (recovered != null) return recovered;
    }
    throw error;
  }
}

export async function consumeCredits(params: {
  workspaceId: string;
  amount: number;
  type: CreditTransactionType;
  description: string;
  idempotencyKey?: string;
  reference?: string;
}) {
  if (params.amount <= 0) throw new Error("Amount must be positive");
  try {
    return await prisma.$transaction(async (tx) => {
      if (params.idempotencyKey) {
        const existing = await tx.creditTransaction.findUnique({ where: { idempotencyKey: params.idempotencyKey } });
        if (existing) {
          const balance = await tx.creditBalance.findUnique({ where: { workspaceId: params.workspaceId } });
          return balance?.available ?? 0;
        }
      }
      const balance = await tx.creditBalance.findUnique({ where: { workspaceId: params.workspaceId } });
      if (!balance || balance.available < params.amount) {
        throw new InsufficientCreditsError();
      }
      let remainingToSpend = params.amount;
      const batches = await tx.creditBatch.findMany({
        where: {
          workspaceId: params.workspaceId,
          remaining: { gt: 0 },
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
        orderBy: [{ expiresAt: "asc" }, { createdAt: "asc" }],
      });
      for (const batch of batches) {
        if (remainingToSpend <= 0) break;
        const take = Math.min(batch.remaining, remainingToSpend);
        await tx.creditBatch.update({
          where: { id: batch.id },
          data: { remaining: { decrement: take } },
        });
        remainingToSpend -= take;
      }
      if (remainingToSpend > 0) {
        throw new InsufficientCreditsError();
      }
      const updated = await tx.creditBalance.update({
        where: { workspaceId: params.workspaceId },
        data: { available: { decrement: params.amount } },
      });
      if (updated.available < 0) {
        throw new InsufficientCreditsError();
      }
      await tx.creditTransaction.create({
        data: {
          workspaceId: params.workspaceId,
          type: params.type,
          amount: -params.amount,
          description: params.description,
          reference: params.reference,
          idempotencyKey: params.idempotencyKey,
        },
      });
      return updated.available;
    });
  } catch (error) {
    if (error instanceof InsufficientCreditsError) throw error;
    if (params.idempotencyKey && isPrismaUniqueViolation(error)) {
      const recovered = await existingBalanceForKey(params.workspaceId, params.idempotencyKey);
      if (recovered != null) return recovered;
    }
    throw error;
  }
}
