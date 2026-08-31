import { describe, expect, it } from "vitest";
import { canManageBilling } from "@/lib/billing/policy";
import { effectivePlanCode, mapStripeSubscriptionStatus } from "@/lib/billing/stripe-status";
import { parseCheckoutPlan, planFromStripePriceId } from "@/lib/billing/plan-from-price";
import {
  billingMissingCategories,
  isStripeLiveKeyBlocked,
  stripeSecretMode,
  stripeProductsStatus,
} from "@/lib/billing/stripe-mode";
import { isBillingCheckoutEnabled } from "@/lib/billing/provider";
import { emailProviderStatus } from "@/lib/email/status";
import { emailTemplate } from "@/lib/email/templates";
import { planPriceLabel } from "@/lib/config/plan-commerce";

function withEnv(values: Record<string, string | undefined>, run: () => void) {
  const keys = Object.keys(values);
  const prev = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    run();
  } finally {
    for (const key of keys) {
      if (prev[key] === undefined) delete process.env[key];
      else process.env[key] = prev[key];
    }
  }
}

describe("stripe mode", () => {
  it("blocks live keys and reports missing test categories without values", () => {
    withEnv(
      {
        STRIPE_SECRET_KEY: "sk_live_blocked",
        NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_live_blocked",
        STRIPE_WEBHOOK_SECRET: undefined,
        STRIPE_PRICE_CREATOR: undefined,
        STRIPE_PRICE_PRO: undefined,
        STRIPE_PRICE_PLUS: undefined,
        STRIPE_PRICE_BASIC: undefined,
        STRIPE_PRICE_BUSINESS: undefined,
      },
      () => {
        expect(stripeSecretMode()).toBe("LIVE");
        expect(isStripeLiveKeyBlocked()).toBe(true);
        expect(isBillingCheckoutEnabled()).toBe(false);
        expect(billingMissingCategories()).toEqual([
          "secret key",
          "publishable key",
          "webhook secret",
          "Creator price",
          "Pro price",
        ]);
      },
    );
  });

  it("marks products as configuration required without price ids", () => {
    withEnv({ STRIPE_PRICE_CREATOR: undefined, STRIPE_PRICE_PRO: undefined, STRIPE_PRICE_PLUS: undefined, STRIPE_PRICE_BUSINESS: undefined }, () => {
      expect(stripeProductsStatus()).toBe("CONFIGURATION REQUIRED");
    });
  });
});

describe("checkout plan parsing", () => {
  it("accepts only product plans from the client", () => {
    expect(parseCheckoutPlan("CREATOR")).toBe("CREATOR");
    expect(parseCheckoutPlan("PRO")).toBe("PRO");
    expect(parseCheckoutPlan("FREE")).toBe("FREE");
    expect(parseCheckoutPlan("price_123")).toBeNull();
    expect(parseCheckoutPlan("BUSINESS")).toBeNull();
    expect(parseCheckoutPlan("sk_test_123")).toBeNull();
  });

  it("ignores arbitrary price tampering", () => {
    withEnv({ STRIPE_PRICE_CREATOR: "price_creator_test", STRIPE_PRICE_PRO: "price_pro_test" }, () => {
      expect(planFromStripePriceId("price_attacker")).toBeNull();
      expect(planFromStripePriceId("price_creator_test")).toBe("CREATOR");
      expect(planFromStripePriceId("price_pro_test")).toBe("PRO");
    });
  });
});

describe("subscription status mapping", () => {
  it("maps stripe statuses instead of treating everything as active", () => {
    expect(mapStripeSubscriptionStatus("active")).toBe("ACTIVE");
    expect(mapStripeSubscriptionStatus("trialing")).toBe("TRIALING");
    expect(mapStripeSubscriptionStatus("past_due")).toBe("PAST_DUE");
    expect(mapStripeSubscriptionStatus("canceled")).toBe("CANCELED");
    expect(mapStripeSubscriptionStatus("unpaid")).toBe("UNPAID");
    expect(mapStripeSubscriptionStatus("incomplete")).toBe("INCOMPLETE");
  });

  it("keeps paid limits during grace and period-end downgrade", () => {
    const future = new Date(Date.now() + 86_400_000);
    const past = new Date(Date.now() - 86_400_000);
    expect(
      effectivePlanCode({
        planCode: "PRO",
        status: "PAST_DUE",
        gracePeriodEndsAt: future,
      }),
    ).toBe("PRO");
    expect(
      effectivePlanCode({
        planCode: "PRO",
        status: "PAST_DUE",
        gracePeriodEndsAt: past,
      }),
    ).toBe("FREE");
    expect(
      effectivePlanCode({
        planCode: "CREATOR",
        status: "ACTIVE",
        cancelAtPeriodEnd: true,
        currentPeriodEnd: future,
      }),
    ).toBe("CREATOR");
  });
});

describe("billing authorization", () => {
  it("allows only workspace owner", () => {
    expect(canManageBilling("OWNER")).toBe(true);
    expect(canManageBilling("ADMIN")).toBe(false);
    expect(canManageBilling("EDITOR")).toBe(false);
    expect(canManageBilling("VIEWER")).toBe(false);
  });
});

describe("commercial prices", () => {
  it("labels Creator and Pro with the configured monthly BRL amounts", () => {
    expect(planPriceLabel("CREATOR")).toMatch(/R\$\s*59,90/);
    expect(planPriceLabel("PRO")).toMatch(/R\$\s*149,90/);
    expect(planPriceLabel("FREE")).toBe("Grátis");
  });
});

describe("email templates", () => {
  it("does not pretend to send without SMTP", async () => {
    const prevHost = process.env.SMTP_HOST;
    const prevFrom = process.env.SMTP_FROM;
    const prevUser = process.env.SMTP_USER;
    const prevPass = process.env.SMTP_PASSWORD;
    delete process.env.SMTP_HOST;
    delete process.env.SMTP_FROM;
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASSWORD;
    expect(emailProviderStatus()).toBe("EMAIL_PROVIDER_NOT_CONFIGURED");
    expect(emailTemplate("subscription-activated").subject).toMatch(/ativo/i);
    expect(emailTemplate("payment-failed").text).toMatch(/pagamento/i);
    if (prevHost) process.env.SMTP_HOST = prevHost;
    if (prevFrom) process.env.SMTP_FROM = prevFrom;
    if (prevUser) process.env.SMTP_USER = prevUser;
    if (prevPass) process.env.SMTP_PASSWORD = prevPass;
  });
});
