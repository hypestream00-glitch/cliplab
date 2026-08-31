import { PRODUCT_PLAN_CODES, type ProductPlanCode } from "@/lib/config/plans";
import { stripePriceId } from "@/lib/billing/stripe-mode";

export function parseCheckoutPlan(value: string | null | undefined): ProductPlanCode | null {
  const plan = String(value ?? "").trim().toUpperCase();
  if (PRODUCT_PLAN_CODES.includes(plan as ProductPlanCode)) return plan as ProductPlanCode;
  return null;
}

export function planFromStripePriceId(priceId: string | null | undefined): ProductPlanCode | null {
  const id = priceId?.trim() ?? "";
  if (!id.startsWith("price_")) return null;
  if (id === stripePriceId("STRIPE_PRICE_CREATOR")) return "CREATOR";
  if (id === stripePriceId("STRIPE_PRICE_PRO")) return "PRO";
  return null;
}

export function priceIdForPlan(plan: ProductPlanCode) {
  if (plan === "CREATOR") return stripePriceId("STRIPE_PRICE_CREATOR");
  if (plan === "PRO") return stripePriceId("STRIPE_PRICE_PRO");
  return null;
}
