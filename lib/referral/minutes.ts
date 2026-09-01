import { prisma } from "@/lib/db/prisma";
import { isPrismaUniqueViolation } from "@/lib/webhooks/idempotency";
import { REFERRAL_AI_MINUTES } from "@/lib/referral/config";
import type { Prisma } from "@/generated/prisma/client";

type Db = Prisma.TransactionClient | typeof prisma;

export async function extraMinuteSeconds(workspaceId: string, tx?: Db) {
  const db = tx ?? prisma;
  const row = await db.minuteGrant.aggregate({
    where: { workspaceId, revokedAt: null },
    _sum: { remaining: true },
  });
  return row._sum.remaining ?? 0;
}

export async function grantReferralMinutes(
  tx: Db,
  params: { workspaceId: string; userId: string; rewardId: string; minutes?: number },
) {
  const minutes = params.minutes ?? REFERRAL_AI_MINUTES;
  const seconds = minutes * 60;
  try {
    await tx.minuteGrant.create({
      data: {
        workspaceId: params.workspaceId,
        userId: params.userId,
        source: "REFERRAL",
        sourceKey: `referral-reward:${params.rewardId}`,
        seconds,
        remaining: seconds,
      },
    });
    return { ok: true as const, duplicate: false as const, seconds };
  } catch (error) {
    if (isPrismaUniqueViolation(error)) return { ok: true as const, duplicate: true as const, seconds };
    throw error;
  }
}

export async function syncMinuteGrantConsumption(params: {
  workspaceId: string;
  usedSeconds: number;
  planLimitSeconds: number;
  periodStart: Date;
  tx?: Db;
}) {
  const db = params.tx ?? prisma;
  const overage = Math.max(0, params.usedSeconds - params.planLimitSeconds);
  const idempotencyKey = `minute-grant-sync:${params.workspaceId}:${params.periodStart.toISOString()}`;
  const existing = await db.usageEvent.findUnique({ where: { idempotencyKey } });
  const applied = existing?.amountSeconds ?? 0;
  const delta = overage - applied;
  if (delta <= 0) {
    if (!existing) {
      await db.usageEvent
        .create({
          data: {
            workspaceId: params.workspaceId,
            type: "MINUTE_GRANT_SYNC",
            amountSeconds: overage,
            idempotencyKey,
          },
        })
        .catch((error) => {
          if (!isPrismaUniqueViolation(error)) throw error;
        });
    }
    return { consumed: 0, overage };
  }
  const grants = await db.minuteGrant.findMany({
    where: { workspaceId: params.workspaceId, revokedAt: null, remaining: { gt: 0 } },
    orderBy: { createdAt: "asc" },
  });
  let left = delta;
  for (const grant of grants) {
    if (left <= 0) break;
    const take = Math.min(grant.remaining, left);
    await db.minuteGrant.update({
      where: { id: grant.id },
      data: { remaining: grant.remaining - take },
    });
    left -= take;
  }
  const consumed = delta - left;
  if (existing) {
    await db.usageEvent.update({
      where: { idempotencyKey },
      data: { amountSeconds: applied + consumed },
    });
  } else {
    await db.usageEvent
      .create({
        data: {
          workspaceId: params.workspaceId,
          type: "MINUTE_GRANT_SYNC",
          amountSeconds: consumed,
          idempotencyKey,
        },
      })
      .catch(async (error) => {
        if (!isPrismaUniqueViolation(error)) throw error;
      });
  }
  return { consumed, overage };
}
