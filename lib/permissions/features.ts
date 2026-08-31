import { getPlanLimits, type FeatureKey, type PlanLimits } from "@/lib/config/plans";

export type FeatureGate =
  | "apiAccess"
  | "liveClipping"
  | "championships"
  | "priority"
  | "teamMembers"
  | "maxAccounts"
  | "maxResolution";

export function canUseFeature(planCode: string, feature: FeatureGate) {
  const limits = getPlanLimits(planCode);
  const value = limits[feature as FeatureKey];
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value > 0;
  return true;
}

export function getUpgradeReason(planCode: string, feature: FeatureGate) {
  if (canUseFeature(planCode, feature)) return null;
  return {
    feature,
    currentPlan: planCode,
    message: "Este recurso não está disponível no seu plano atual.",
  };
}

export function assertWithinLimit(limits: PlanLimits, key: FeatureKey, used: number) {
  const max = limits[key];
  if (typeof max !== "number") return true;
  return used < max;
}
