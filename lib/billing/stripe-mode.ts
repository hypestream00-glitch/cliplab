export const BILLING_POLICY = {
  downgradeTiming: "end_of_period" as const,
  gracePeriodDays: 3,
};

export type BillingMissingCategory =
  | "secret key"
  | "publishable key"
  | "webhook secret"
  | "Creator price"
  | "Pro price";

export type StripeMode = "TEST" | "LIVE" | "MISSING";

function keyPrefixMode(value: string | undefined, testPrefix: string, livePrefix: string): StripeMode {
  const key = value?.trim() ?? "";
  if (!key) return "MISSING";
  if (key.startsWith(livePrefix)) return "LIVE";
  if (key.startsWith(testPrefix)) return "TEST";
  return "MISSING";
}

export function stripeSecretMode(): StripeMode {
  return keyPrefixMode(process.env.STRIPE_SECRET_KEY, "sk_test_", "sk_live_");
}

export function stripePublishableMode(): StripeMode {
  return keyPrefixMode(
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? process.env.STRIPE_PUBLISHABLE_KEY,
    "pk_test_",
    "pk_live_",
  );
}

export function isStripeLiveKeyBlocked() {
  return stripeSecretMode() === "LIVE" || stripePublishableMode() === "LIVE";
}

export function stripeWebhookConfigured() {
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim() ?? "";
  return secret.startsWith("whsec_");
}

export function stripePriceId(envName: "STRIPE_PRICE_CREATOR" | "STRIPE_PRICE_PRO") {
  const fallback =
    envName === "STRIPE_PRICE_CREATOR"
      ? process.env.STRIPE_PRICE_PLUS ?? process.env.STRIPE_PRICE_BASIC
      : process.env.STRIPE_PRICE_BUSINESS;
  const value = (process.env[envName] ?? fallback)?.trim() ?? "";
  return value.startsWith("price_") ? value : null;
}

export function billingMissingCategories(): BillingMissingCategory[] {
  const missing: BillingMissingCategory[] = [];
  if (stripeSecretMode() !== "TEST") missing.push("secret key");
  if (stripePublishableMode() !== "TEST") missing.push("publishable key");
  if (!stripeWebhookConfigured()) missing.push("webhook secret");
  if (!stripePriceId("STRIPE_PRICE_CREATOR")) missing.push("Creator price");
  if (!stripePriceId("STRIPE_PRICE_PRO")) missing.push("Pro price");
  return missing;
}

export function stripeProductsStatus() {
  const creator = Boolean(stripePriceId("STRIPE_PRICE_CREATOR"));
  const pro = Boolean(stripePriceId("STRIPE_PRICE_PRO"));
  return creator && pro ? "CONFIGURED" : "CONFIGURATION REQUIRED";
}

export function isStripeTestReady() {
  return billingMissingCategories().length === 0 && !isStripeLiveKeyBlocked();
}
