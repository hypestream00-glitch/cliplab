import { getSupportedPlatforms } from "@/lib/social/upload-post/platforms";
import { socialPlatformLabel } from "@/lib/social/labels";
import { PRODUCT_PLAN_CODES, PLAN_LIMITS, type ProductPlanCode } from "@/lib/config/plans";
import { planPriceLabel } from "@/lib/config/plan-commerce";

export const ONBOARDING_STEPS = 6;

export const ONBOARDING_GOALS = [
  { value: "clips", label: "Criar clips para mim" },
  { value: "manage", label: "Gerenciar conteúdo" },
  { value: "agency", label: "Agência/equipe" },
  { value: "other", label: "Outro" },
] as const;

export type OnboardingGoal = (typeof ONBOARDING_GOALS)[number]["value"];

export function onboardingPlatforms() {
  return getSupportedPlatforms().map((platform) => ({
    value: platform,
    label: socialPlatformLabel(platform),
  }));
}

export function onboardingPlans() {
  return PRODUCT_PLAN_CODES.map((code: ProductPlanCode) => ({
    code,
    name: PLAN_LIMITS[code].name,
    price: planPriceLabel(code),
    minutes: PLAN_LIMITS[code].monthlyMinutes,
    accounts: PLAN_LIMITS[code].maxAccounts,
    clips: PLAN_LIMITS[code].maxClipsPerProject,
  }));
}

export function clampOnboardingStep(value: unknown, fallback = 1) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(ONBOARDING_STEPS, Math.max(1, Math.trunc(n)));
}

export function parseOnboardingGoal(value: string | undefined | null): OnboardingGoal | undefined {
  return ONBOARDING_GOALS.some((goal) => goal.value === value) ? (value as OnboardingGoal) : undefined;
}

export function parseOnboardingPlatforms(values: string[]): string {
  const allowed = new Set(getSupportedPlatforms());
  return values.filter((value) => allowed.has(value as never)).join(",");
}

export function parseOnboardingPlan(value: string | undefined | null): ProductPlanCode {
  if (value === "CREATOR" || value === "PRO" || value === "FREE") return value;
  return "FREE";
}
