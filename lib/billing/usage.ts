import { prisma } from "@/lib/db/prisma";
import { getPlanLimits } from "@/lib/config/plans";
import {
  PlanLimitError,
  processingIdempotencyKey,
  secondsFromDurationMs,
} from "@/lib/billing/usage-math";
import { effectivePlanCode } from "@/lib/billing/stripe-status";
import { listActiveGrants } from "@/lib/billing/grants";
import { mergePlanWithGrants, pickActiveGrant, remainingGrantDays } from "@/lib/billing/plan-rank";
import { extraMinuteSeconds, syncMinuteGrantConsumption } from "@/lib/referral/minutes";

export { PlanLimitError, secondsFromDurationMs, minutesFromSeconds, formatMinutesUsed, processingIdempotencyKey } from "@/lib/billing/usage-math";

function periodStart(subscriptionStart?: Date | null) {
  if (subscriptionStart) return subscriptionStart;
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

async function resolveWorkspacePlan(workspaceId: string, now = new Date()) {
  const [subscription, grants] = await Promise.all([
    prisma.subscription.findUnique({
      where: { workspaceId },
      include: { plan: true },
    }),
    listActiveGrants(workspaceId, now),
  ]);
  const stripePlan = subscription
    ? effectivePlanCode({
        planCode: subscription.plan.code,
        status: subscription.status,
        currentPeriodEnd: subscription.currentPeriodEnd,
        cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
        gracePeriodEndsAt: subscription.gracePeriodEndsAt,
      })
    : "FREE";
  const planCode = mergePlanWithGrants(stripePlan, grants, now);
  const activeGrant = pickActiveGrant(grants, now);
  return { subscription, grants, stripePlan, planCode, activeGrant };
}

export async function getWorkspacePlanCode(workspaceId: string) {
  const resolved = await resolveWorkspacePlan(workspaceId);
  return resolved.planCode;
}

export async function getMonthlyUsage(workspaceId: string) {
  const now = new Date();
  const resolved = await resolveWorkspacePlan(workspaceId, now);
  const { subscription, planCode, stripePlan, activeGrant } = resolved;
  const limits = getPlanLimits(planCode);
  const start = periodStart(subscription?.currentPeriodStart ?? null);
  const used = await prisma.usageEvent.aggregate({
    where: { workspaceId, type: "VIDEO_PROCESSING", createdAt: { gte: start } },
    _sum: { amountSeconds: true },
  });
  const usedSeconds = used._sum.amountSeconds ?? 0;
  const planLimitSeconds = limits.monthlyMinutes * 60;
  await syncMinuteGrantConsumption({
    workspaceId,
    usedSeconds,
    planLimitSeconds,
    periodStart: start,
  });
  const extraSeconds = await extraMinuteSeconds(workspaceId);
  const planRemaining = Math.max(0, planLimitSeconds - usedSeconds);
  const remainingSeconds = planRemaining + extraSeconds;
  const limitSeconds = usedSeconds + remainingSeconds;
  return {
    usedSeconds,
    limitSeconds,
    remainingSeconds,
    extraSeconds,
    limits,
    periodStart: start,
    periodEnd: subscription?.currentPeriodEnd ?? activeGrant?.endsAt ?? null,
    status: subscription?.status ?? "ACTIVE",
    storedPlanCode: subscription?.plan.code ?? "FREE",
    stripePlanCode: stripePlan,
    effectivePlanCode: planCode,
    cancelAtPeriodEnd: subscription?.cancelAtPeriodEnd ?? false,
    activeGrant: activeGrant
      ? {
          planCode: activeGrant.planCode,
          source: activeGrant.source,
          endsAt: activeGrant.endsAt,
          daysLeft: remainingGrantDays(activeGrant.endsAt, now),
        }
      : null,
  };
}

export async function assertMinutesAvailable(workspaceId: string, durationMs: number, projectId?: string) {
  const usage = await getMonthlyUsage(workspaceId);
  const needed = secondsFromDurationMs(durationMs);
  let alreadyReserved = 0;
  if (projectId) {
    const existing = await prisma.usageEvent.findUnique({
      where: { idempotencyKey: processingIdempotencyKey(projectId) },
    });
    alreadyReserved = existing?.amountSeconds ?? 0;
  }
  const projected = usage.usedSeconds - alreadyReserved + needed;
  if (projected > usage.limitSeconds) {
    throw new PlanLimitError("Você atingiu o limite do seu plano.");
  }
  if (needed > usage.limits.maxVideoDurationSeconds) {
    throw new PlanLimitError("Este vídeo ultrapassa a duração máxima do seu plano.");
  }
  return needed;
}

export async function recordProcessingUsage(params: {
  workspaceId: string;
  projectId: string;
  durationMs: number;
}) {
  const amountSeconds = secondsFromDurationMs(params.durationMs);
  await prisma.usageEvent.upsert({
    where: { idempotencyKey: processingIdempotencyKey(params.projectId) },
    create: {
      workspaceId: params.workspaceId,
      projectId: params.projectId,
      type: "VIDEO_PROCESSING",
      amountSeconds,
      idempotencyKey: processingIdempotencyKey(params.projectId),
    },
    update: {},
  });
  const usage = await getMonthlyUsage(params.workspaceId);
  await syncMinuteGrantConsumption({
    workspaceId: params.workspaceId,
    usedSeconds: usage.usedSeconds,
    planLimitSeconds: usage.limits.monthlyMinutes * 60,
    periodStart: usage.periodStart,
  });
  return amountSeconds;
}

export async function assertSocialAccountLimit(workspaceId: string) {
  const code = await getWorkspacePlanCode(workspaceId);
  const limits = getPlanLimits(code);
  const used = await prisma.socialAccount.count({
    where: { workspaceId, mock: false, status: { in: ["CONNECTED", "TOKEN_EXPIRING"] } },
  });
  if (used >= limits.maxAccounts) {
    throw new PlanLimitError("Você atingiu o limite de contas sociais do seu plano.");
  }
}

export async function assertWorkspaceJobQuota(workspaceId: string, kind: "generation" | "export") {
  const planCode = await getWorkspacePlanCode(workspaceId);
  const limits = getPlanLimits(planCode);
  const max = kind === "generation" ? limits.maxConcurrentGeneration : limits.maxConcurrentExports;
  const types =
    kind === "generation"
      ? (["VIDEO_IMPORT", "VIDEO_PROCESSING", "TRANSCRIPTION", "AI_ANALYSIS", "CLIP_GENERATION"] as const)
      : (["RENDER"] as const);
  const active = await prisma.processingJob.count({
    where: {
      workspaceId,
      type: { in: [...types] },
      status: { in: ["WAITING", "DELAYED", "ACTIVE"] },
    },
  });
  if (active >= max) {
    throw new PlanLimitError(
      kind === "generation"
        ? `Limite de processamentos simultâneos do plano (${max}). Aguarde a fila.`
        : `Limite de renders simultâneos do plano (${max}). Aguarde a fila.`,
    );
  }
}
