import { prisma } from "@/lib/db/prisma";
import { getPlanLimits, productPlanCode, type PlanCode } from "@/lib/config/plans";
import { grantCredits } from "@/lib/billing/credits";
import { logger } from "@/lib/logger";
import { mapStripeSubscriptionStatus } from "@/lib/billing/stripe-status";
import { planFromStripePriceId } from "@/lib/billing/plan-from-price";
import { subscriptionPeriod, subscriptionPriceId } from "@/lib/billing/stripe-client";
import { gracePeriodEndsAt } from "@/lib/billing/policy";
import { resolveUsagePeriodStart } from "@/lib/billing/usage-window";
import type Stripe from "stripe";

export async function applyLocalPlanChange(workspaceId: string, planCode: PlanCode, idempotencyKey?: string) {
  const plan = await prisma.plan.findUnique({ where: { code: planCode } });
  if (!plan) throw new Error("Plano não encontrado");
  const current = await prisma.subscription.findUnique({ where: { workspaceId } });
  const now = new Date();
  const periodEnd = current?.currentPeriodEnd ?? new Date(now.getTime() + 1000 * 60 * 60 * 24 * 30);
  const periodStart = current?.currentPeriodStart ?? now;
  await prisma.subscription.upsert({
    where: { workspaceId },
    create: {
      workspaceId,
      planId: plan.id,
      status: "ACTIVE",
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
    },
    update: {
      planId: plan.id,
      status: "ACTIVE",
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
    },
  });
  const grant = getPlanLimits(planCode).credits;
  if (grant > 0 && current?.planId !== plan.id) {
    await grantCredits({
      workspaceId,
      amount: grant,
      type: "SUBSCRIPTION_GRANT",
      description: `Créditos do plano ${plan.name}`,
      idempotencyKey,
      reference: idempotencyKey,
    });
  }
  logger.info({ workspaceId, planCode }, "local plan changed");
}

export async function findWorkspaceForStripeCustomer(params: {
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
  metadataWorkspaceId?: string | null;
}) {
  if (params.stripeCustomerId) {
    const byCustomer = await prisma.subscription.findFirst({
      where: { stripeCustomerId: params.stripeCustomerId },
      include: { plan: true },
    });
    if (byCustomer) {
      if (params.metadataWorkspaceId && params.metadataWorkspaceId !== byCustomer.workspaceId) {
        logger.warn(
          { workspaceId: byCustomer.workspaceId },
          "stripe metadata workspaceId did not match customer workspace; ignoring metadata",
        );
      }
      return byCustomer;
    }
  }
  if (params.stripeSubscriptionId) {
    const bySub = await prisma.subscription.findFirst({
      where: { stripeSubscriptionId: params.stripeSubscriptionId },
      include: { plan: true },
    });
    if (bySub) return bySub;
  }
  return null;
}

export async function applyStripeSubscription(subscription: Stripe.Subscription, metadataWorkspaceId?: string | null) {
  const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer?.id;
  const existing = await findWorkspaceForStripeCustomer({
    stripeCustomerId: customerId,
    stripeSubscriptionId: subscription.id,
    metadataWorkspaceId,
  });
  const workspaceId = existing?.workspaceId ?? metadataWorkspaceId ?? null;
  if (!workspaceId) {
    logger.warn({ stripeSubscriptionId: subscription.id }, "stripe subscription had no matching workspace");
    return { applied: false as const };
  }
  if (existing && metadataWorkspaceId && metadataWorkspaceId !== existing.workspaceId) {
    return { applied: false as const, reason: "workspace-mismatch" as const };
  }

  const priceId = subscriptionPriceId(subscription);
  const fromPrice = planFromStripePriceId(priceId);
  const metadataPlan = productPlanCode(subscription.metadata?.plan ?? "FREE");
  const planCode = fromPrice ?? (existing ? productPlanCode(existing.plan.code) : metadataPlan);
  const plan = await prisma.plan.findUnique({ where: { code: planCode } });
  if (!plan) return { applied: false as const };

  const period = subscriptionPeriod(subscription);
  const status = mapStripeSubscriptionStatus(subscription.status);
  const cancelAtPeriodEnd = Boolean(subscription.cancel_at_period_end);
  const nextPlanCode = status === "CANCELED" && !cancelAtPeriodEnd ? "FREE" : planCode;
  const nextPlan = nextPlanCode === plan.code ? plan : await prisma.plan.findUnique({ where: { code: nextPlanCode } });
  if (!nextPlan) return { applied: false as const };
  const usagePeriodStart = resolveUsagePeriodStart({
    incomingStart: period.start,
    existingStart: existing?.currentPeriodStart ?? null,
    existingEnd: existing?.currentPeriodEnd ?? null,
  });

  await prisma.subscription.upsert({
    where: { workspaceId },
    create: {
      workspaceId,
      planId: nextPlan.id,
      status,
      stripeCustomerId: customerId,
      stripeSubscriptionId: subscription.id,
      currentPeriodStart: usagePeriodStart,
      currentPeriodEnd: period.end,
      cancelAtPeriodEnd,
      gracePeriodEndsAt: status === "PAST_DUE" || status === "UNPAID" ? gracePeriodEndsAt() : null,
    },
    update: {
      planId: nextPlan.id,
      status,
      stripeCustomerId: customerId ?? existing?.stripeCustomerId,
      stripeSubscriptionId: subscription.id,
      currentPeriodStart: usagePeriodStart ?? existing?.currentPeriodStart,
      currentPeriodEnd: period.end ?? existing?.currentPeriodEnd,
      cancelAtPeriodEnd,
      gracePeriodEndsAt:
        status === "PAST_DUE" || status === "UNPAID"
          ? (existing?.gracePeriodEndsAt ?? gracePeriodEndsAt())
          : status === "ACTIVE" || status === "TRIALING"
            ? null
            : existing?.gracePeriodEndsAt,
    },
  });
  logger.info({ workspaceId, plan: nextPlan.code, status }, "stripe subscription synced");
  return {
    applied: true as const,
    workspaceId,
    planCode: nextPlan.code,
    previousPlanCode: existing?.plan.code ?? null,
    previousCancelAtPeriodEnd: existing?.cancelAtPeriodEnd ?? false,
  };
}
