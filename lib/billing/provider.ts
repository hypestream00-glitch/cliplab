import { isStripeTestReady } from "@/lib/billing/stripe-mode";

export type BillingProviderMode = "UNCONFIGURED" | "STRIPE_TEST";

export function billingProviderMode(): BillingProviderMode {
  return isStripeTestReady() ? "STRIPE_TEST" : "UNCONFIGURED";
}

export function isBillingCheckoutEnabled() {
  return billingProviderMode() === "STRIPE_TEST";
}
