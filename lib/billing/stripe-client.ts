import Stripe from "stripe";
import { logger } from "@/lib/logger";
import { isStripeLiveKeyBlocked, stripeSecretMode } from "@/lib/billing/stripe-mode";

let cached: Stripe | null | undefined;

export function getStripeClient(): Stripe | null {
  if (cached !== undefined) return cached;
  if (isStripeLiveKeyBlocked()) {
    logger.error("Stripe live keys are blocked. Billing will not start.");
    cached = null;
    return null;
  }
  if (stripeSecretMode() !== "TEST") {
    cached = null;
    return null;
  }
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) {
    cached = null;
    return null;
  }
  cached = new Stripe(key);
  return cached;
}

export function resetStripeClientForTests() {
  cached = undefined;
}

export function isStripeConfigured() {
  return stripeSecretMode() === "TEST" && !isStripeLiveKeyBlocked();
}

export function subscriptionPeriod(subscription: Stripe.Subscription) {
  const item = subscription.items?.data?.[0];
  const start = item?.current_period_start;
  const end = item?.current_period_end;
  return {
    start: typeof start === "number" ? new Date(start * 1000) : null,
    end: typeof end === "number" ? new Date(end * 1000) : null,
  };
}

export function subscriptionPriceId(subscription: Stripe.Subscription) {
  const price = subscription.items?.data?.[0]?.price;
  if (!price) return null;
  return typeof price === "string" ? price : price.id;
}
