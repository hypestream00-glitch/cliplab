import { prisma } from "@/lib/db/prisma";
import type { PlanCode } from "@/generated/prisma/client";
import { productPlanCode } from "@/lib/config/plans";
import { pickActiveGrant, remainingGrantDays } from "@/lib/billing/plan-rank";

export async function listActiveGrants(workspaceId: string, now = new Date()) {
  return prisma.workspaceGrant.findMany({
    where: { workspaceId, endsAt: { gt: now } },
    orderBy: { endsAt: "desc" },
  });
}

export async function applyPlanGrant(params: {
  workspaceId: string;
  userId?: string | null;
  source: string;
  sourceKey?: string | null;
  planCode: PlanCode;
  days: number;
  now?: Date;
}) {
  const now = params.now ?? new Date();
  const existing = await prisma.workspaceGrant.findMany({
    where: {
      workspaceId: params.workspaceId,
      endsAt: { gt: now },
      planCode: params.planCode,
    },
    orderBy: { endsAt: "desc" },
    take: 1,
  });
  const base = existing[0] && existing[0].endsAt.getTime() > now.getTime() ? existing[0].endsAt : now;
  return prisma.workspaceGrant.create({
    data: {
      workspaceId: params.workspaceId,
      userId: params.userId ?? null,
      source: params.source,
      sourceKey: params.sourceKey ?? null,
      planCode: params.planCode,
      startsAt: now,
      endsAt: new Date(base.getTime() + params.days * 24 * 60 * 60 * 1000),
    },
  });
}

export async function workspaceGrantSummary(workspaceId: string, now = new Date()) {
  const grants = await listActiveGrants(workspaceId, now);
  const active = pickActiveGrant(grants, now);
  if (!active) return null;
  return {
    planCode: productPlanCode(active.planCode),
    source: active.source,
    endsAt: active.endsAt,
    daysLeft: remainingGrantDays(active.endsAt, now),
  };
}
