export const PUBLIC_PROMO_CODE = "MUGAO12";

export function normalizePromoCode(value: string) {
  return value.trim().toUpperCase().replace(/\s+/g, "");
}

export const MUGAO12 = {
  code: PUBLIC_PROMO_CODE,
  name: "3 dias grátis",
  description: "Ganhe 3 dias grátis no CortaClip.",
  benefitDays: 3,
  grantPlanCode: "CREATOR" as const,
  benefitType: "PLAN_GRANT" as const,
};
