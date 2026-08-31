import { PLAN_LIMITS, PRODUCT_PLAN_CODES, type ProductPlanCode } from "@/lib/config/plans";
import { stripePriceId } from "@/lib/billing/stripe-mode";

export type PlanCommerce = {
  code: ProductPlanCode;
  priceMonthly: number | null;
  currency: "brl";
  interval: "month";
  stripePriceEnv: "STRIPE_PRICE_CREATOR" | "STRIPE_PRICE_PRO" | null;
};

export const PLAN_COMMERCE: Record<ProductPlanCode, PlanCommerce> = {
  FREE: { code: "FREE", priceMonthly: null, currency: "brl", interval: "month", stripePriceEnv: null },
  CREATOR: {
    code: "CREATOR",
    priceMonthly: 59.9,
    currency: "brl",
    interval: "month",
    stripePriceEnv: "STRIPE_PRICE_CREATOR",
  },
  PRO: {
    code: "PRO",
    priceMonthly: 149.9,
    currency: "brl",
    interval: "month",
    stripePriceEnv: "STRIPE_PRICE_PRO",
  },
};

export function planCommerce(code: string): PlanCommerce {
  if (code === "PRO" || code === "BUSINESS") return PLAN_COMMERCE.PRO;
  if (code === "FREE") return PLAN_COMMERCE.FREE;
  return PLAN_COMMERCE.CREATOR;
}

export function planPriceLabel(code: ProductPlanCode) {
  const commerce = PLAN_COMMERCE[code];
  if (commerce.priceMonthly != null) {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(commerce.priceMonthly);
  }
  if (commerce.stripePriceEnv && stripePriceId(commerce.stripePriceEnv)) return "Mensal";
  if (code === "FREE") return "Grátis";
  return "Preço a definir";
}

export function paidProductPlans() {
  return PRODUCT_PLAN_CODES.filter((code) => code !== "FREE").map((code) => ({
    code,
    limits: PLAN_LIMITS[code],
    commerce: PLAN_COMMERCE[code],
  }));
}
