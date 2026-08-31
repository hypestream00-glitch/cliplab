import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/logger";
import { getStripeClient } from "@/lib/billing/stripe-client";
import { isBillingCheckoutEnabled } from "@/lib/billing/provider";
import { getOrCreateStripeCustomer } from "@/lib/billing/customer";
import { parseCheckoutPlan, priceIdForPlan } from "@/lib/billing/plan-from-price";
import { billingMissingCategories, isStripeLiveKeyBlocked } from "@/lib/billing/stripe-mode";
import { BILLING_POLICY } from "@/lib/billing/policy";
import { publicBaseUrl } from "@/lib/env/app-url";
import type { ProductPlanCode } from "@/lib/config/plans";

export { getStripeClient, isStripeConfigured } from "@/lib/billing/stripe-client";
export { applyLocalPlanChange as applyDevelopmentPlanChange } from "@/lib/billing/apply-subscription";

export type CheckoutResult =
  | { mode: "stripe"; url: string }
  | { mode: "unconfigured"; url: null; missing: ReturnType<typeof billingMissingCategories> }
  | { mode: "blocked-live"; url: null }
  | { mode: "invalid-plan"; url: null }
  | { mode: "scheduled-downgrade"; url: null }
  | { mode: "no-subscription"; url: null };

export async function startPlanCheckout(params: {
  workspaceId: string;
  plan: string;
  successUrl?: string;
  cancelUrl?: string;
}) {
  const plan = parseCheckoutPlan(params.plan);
  if (!plan) return { mode: "invalid-plan" as const, url: null };

  if (isStripeLiveKeyBlocked()) {
    return { mode: "blocked-live" as const, url: null };
  }

  if (!isBillingCheckoutEnabled()) {
    return { mode: "unconfigured" as const, url: null, missing: billingMissingCategories() };
  }

  if (plan === "FREE") {
    return scheduleDowngradeToFree(params.workspaceId);
  }

  const stripe = getStripeClient();
  const priceId = priceIdForPlan(plan);
  if (!stripe || !priceId) {
    return { mode: "unconfigured" as const, url: null, missing: billingMissingCategories() };
  }

  const customer = await getOrCreateStripeCustomer(params.workspaceId);
  if (!customer.customerId) {
    return { mode: "no-subscription" as const, url: null };
  }

  const origin = publicBaseUrl();
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customer.customerId,
    success_url: params.successUrl ?? `${origin}/billing/success`,
    cancel_url: params.cancelUrl ?? `${origin}/billing/cancel`,
    client_reference_id: params.workspaceId,
    line_items: [{ price: priceId, quantity: 1 }],
    metadata: { workspaceId: params.workspaceId, plan },
    subscription_data: {
      metadata: { workspaceId: params.workspaceId, plan },
    },
  });
  if (!session.url) {
    logger.warn({ workspaceId: params.workspaceId, plan }, "stripe checkout session missing url");
    return { mode: "unconfigured" as const, url: null, missing: billingMissingCategories() };
  }
  return { mode: "stripe" as const, url: session.url };
}

async function scheduleDowngradeToFree(workspaceId: string): Promise<CheckoutResult> {
  const stripe = getStripeClient();
  const subscription = await prisma.subscription.findUnique({ where: { workspaceId } });
  if (!stripe || !subscription?.stripeSubscriptionId) {
    return { mode: "unconfigured" as const, url: null, missing: billingMissingCategories() };
  }
  if (BILLING_POLICY.downgradeTiming === "end_of_period") {
    await stripe.subscriptions.update(subscription.stripeSubscriptionId, { cancel_at_period_end: true });
    await prisma.subscription.update({
      where: { workspaceId },
      data: { cancelAtPeriodEnd: true },
    });
  }
  return { mode: "scheduled-downgrade" as const, url: null };
}

export async function createBillingPortal(params: { workspaceId: string; returnUrl?: string; customerId?: string }) {
  if (params.customerId) {
    logger.warn({ workspaceId: params.workspaceId }, "ignored client-supplied stripe customer id");
  }
  if (isStripeLiveKeyBlocked()) {
    return { mode: "blocked-live" as const, url: null };
  }
  if (!isBillingCheckoutEnabled()) {
    return { mode: "unconfigured" as const, url: null, missing: billingMissingCategories() };
  }
  const stripe = getStripeClient();
  const subscription = await prisma.subscription.findUnique({ where: { workspaceId: params.workspaceId } });
  if (!stripe || !subscription?.stripeCustomerId) {
    return { mode: "unconfigured" as const, url: null, missing: billingMissingCategories() };
  }
  const origin = publicBaseUrl();
  const session = await stripe.billingPortal.sessions.create({
    customer: subscription.stripeCustomerId,
    return_url: params.returnUrl ?? `${origin}/studio/settings/billing`,
  });
  return { mode: "stripe" as const, url: session.url };
}

export function paidPlanFromClient(plan: ProductPlanCode) {
  return plan === "CREATOR" || plan === "PRO" ? plan : null;
}
