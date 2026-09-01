import Stripe from "stripe";
import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/logger";
import { getStripeClient } from "@/lib/billing/stripe-client";
import { isStripeLiveKeyBlocked, stripeSecretMode, stripeWebhookConfigured } from "@/lib/billing/stripe-mode";
import { applyStripeSubscription, findWorkspaceForStripeCustomer } from "@/lib/billing/apply-subscription";
import { isPrismaUniqueViolation } from "@/lib/webhooks/idempotency";
import { rateLimitAsync } from "@/lib/security/rate-limit";
import { gracePeriodEndsAt } from "@/lib/billing/policy";
import { subscriptionPriceId } from "@/lib/billing/stripe-client";
import { productPlanCode } from "@/lib/config/plans";
import { maybeGrantReferralReward } from "@/lib/referral/reward";
import { maybeCancelReferralOnRefund } from "@/lib/referral/refund";
import {
  notifyPaymentFailed,
  notifySubscriptionActivated,
  notifySubscriptionCanceled,
  notifySubscriptionChanged,
} from "@/lib/email/billing";

export type StripeWebhookResult =
  | { ok: true; duplicate?: boolean; type?: string }
  | { ok: false; status: number; error: string };

const HANDLED = new Set([
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.paid",
  "invoice.payment_failed",
  "charge.refunded",
  "charge.dispute.created",
]);

export async function handleStripeWebhook(params: {
  rawBody: string;
  signature: string | null;
  ip?: string | null;
}): Promise<StripeWebhookResult> {
  const limited = await rateLimitAsync({ key: `stripe-webhook:${params.ip ?? "unknown"}`, limit: 300, windowMs: 60_000 });
  if (!limited.ok) {
    return { ok: false, status: 429, error: "Rate limited" };
  }
  if (isStripeLiveKeyBlocked()) {
    return { ok: false, status: 400, error: "Stripe live mode is not allowed" };
  }
  if (stripeSecretMode() !== "TEST" || !stripeWebhookConfigured()) {
    return { ok: false, status: 400, error: "Stripe webhook is not configured for test mode" };
  }
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  const stripe = getStripeClient();
  if (!secret || !params.signature || !params.rawBody || !stripe) {
    return { ok: false, status: 400, error: "Missing Stripe webhook signature or configuration" };
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(params.rawBody, params.signature, secret);
  } catch (error) {
    logger.warn({ err: error }, "stripe webhook signature failed");
    return { ok: false, status: 400, error: "Invalid signature" };
  }

  try {
    await prisma.processedStripeEvent.create({ data: { id: event.id, type: event.type } });
  } catch (error) {
    if (isPrismaUniqueViolation(error)) {
      return { ok: true, duplicate: true, type: event.type };
    }
    throw error;
  }

  try {
    if (HANDLED.has(event.type)) {
      await dispatchStripeEvent(stripe, event);
    }
  } catch (error) {
    await prisma.processedStripeEvent.delete({ where: { id: event.id } }).catch(() => undefined);
    throw error;
  }

  logger.info({ eventId: event.id, type: event.type }, "stripe webhook processed");
  return { ok: true, type: event.type };
}

async function dispatchStripeEvent(stripe: Stripe, event: Stripe.Event) {
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const subscriptionId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
      if (!subscriptionId) return;
      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      await applyStripeSubscription(subscription, session.metadata?.workspaceId ?? subscription.metadata?.workspaceId);
      return;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      const applied = await applyStripeSubscription(subscription, subscription.metadata?.workspaceId);
      if (!applied.applied) return;
      const planCode = applied.planCode;
      if (event.type === "customer.subscription.created") {
        await notifySubscriptionActivated({ workspaceId: applied.workspaceId, subscription, planCode });
        return;
      }
      if (event.type === "customer.subscription.deleted") {
        await notifySubscriptionCanceled({ workspaceId: applied.workspaceId, subscription, ended: true });
        return;
      }
      if (subscription.cancel_at_period_end && !applied.previousCancelAtPeriodEnd) {
        await notifySubscriptionCanceled({ workspaceId: applied.workspaceId, subscription, ended: false });
        return;
      }
      const nextProduct = productPlanCode(planCode);
      const previousProduct = applied.previousPlanCode ? productPlanCode(applied.previousPlanCode) : null;
      if (previousProduct && nextProduct !== previousProduct) {
        await notifySubscriptionChanged({
          workspaceId: applied.workspaceId,
          subscription,
          planCode,
          priceId: subscriptionPriceId(subscription) ?? planCode,
        });
      }
      return;
    }
    case "invoice.paid": {
      const invoice = event.data.object as Stripe.Invoice;
      await recordInvoice(invoice, "paid");
      await maybeRewardFromInvoice(invoice, event.id);
      return;
    }
    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      await recordInvoice(invoice, "payment_failed");
      const customerId = typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;
      const existing = await findWorkspaceForStripeCustomer({
        stripeCustomerId: customerId,
        metadataWorkspaceId: invoice.metadata?.workspaceId,
      });
      if (existing) {
        await prisma.subscription.update({
          where: { workspaceId: existing.workspaceId },
          data: {
            status: "PAST_DUE",
            gracePeriodEndsAt: existing.gracePeriodEndsAt ?? gracePeriodEndsAt(),
          },
        });
        await notifyPaymentFailed({ workspaceId: existing.workspaceId, invoiceId: invoice.id });
      }
      return;
    }
    case "charge.refunded":
    case "charge.dispute.created": {
      const charge = event.data.object as Stripe.Charge & { invoice?: string | { id?: string } | null };
      const customerId = typeof charge.customer === "string" ? charge.customer : charge.customer?.id;
      const invoiceId = typeof charge.invoice === "string" ? charge.invoice : charge.invoice?.id;
      await maybeCancelReferralOnRefund({
        stripeEventId: event.id,
        stripeCustomerId: customerId,
        stripeInvoiceId: invoiceId ?? null,
      });
      return;
    }
    default:
      return;
  }
}

async function maybeRewardFromInvoice(invoice: Stripe.Invoice, eventId: string) {
  const paid = invoice.amount_paid ?? 0;
  if (paid <= 0) return;
  const customerId = typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;
  const subscriptionId = invoiceSubscriptionId(invoice);
  const existing = await findWorkspaceForStripeCustomer({
    stripeCustomerId: customerId,
    stripeSubscriptionId: subscriptionId,
    metadataWorkspaceId: invoice.metadata?.workspaceId,
  });
  if (!existing) return;
  await maybeGrantReferralReward({
    referredWorkspaceId: existing.workspaceId,
    stripeEventId: eventId,
    stripeInvoiceId: invoice.id,
    stripeCustomerId: customerId,
    stripeSubscriptionId: subscriptionId,
    paidAmount: paid,
    planCode: existing.plan.code,
  });
}

function invoiceSubscriptionId(invoice: Stripe.Invoice) {
  const value = invoice.parent?.subscription_details?.subscription;
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "id" in value) return value.id;
  return null;
}

async function recordInvoice(invoice: Stripe.Invoice, status: string) {
  const customerId = typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;
  const subscriptionId = invoiceSubscriptionId(invoice);
  const existing = await findWorkspaceForStripeCustomer({
    stripeCustomerId: customerId,
    stripeSubscriptionId: subscriptionId,
    metadataWorkspaceId: invoice.metadata?.workspaceId,
  });
  if (!existing) return;
  await prisma.invoiceRecord.upsert({
    where: { stripeInvoiceId: invoice.id },
    create: {
      subscriptionId: existing.id,
      stripeInvoiceId: invoice.id,
      amount: invoice.amount_paid || invoice.amount_due || 0,
      currency: invoice.currency ?? "brl",
      status,
      hostedUrl: invoice.hosted_invoice_url,
    },
    update: {
      status,
      amount: invoice.amount_paid || invoice.amount_due || 0,
      hostedUrl: invoice.hosted_invoice_url,
    },
  });
  if (status === "paid") {
    await prisma.subscription.update({
      where: { workspaceId: existing.workspaceId },
      data: { status: existing.status === "CANCELED" ? existing.status : "ACTIVE", gracePeriodEndsAt: null },
    });
  }
}
