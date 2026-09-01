import { productPlanCode, type ProductPlanCode } from "@/lib/config/plans";

export function planRank(code: string): number {
  const product = productPlanCode(code);
  if (product === "PRO") return 2;
  if (product === "CREATOR") return 1;
  return 0;
}

export function higherPlan(a: string, b: string): ProductPlanCode {
  return planRank(a) >= planRank(b) ? productPlanCode(a) : productPlanCode(b);
}

export type PlanGrantInput = {
  planCode: string;
  endsAt: Date;
  source?: string;
};

export function mergePlanWithGrants(
  stripePlan: string,
  grants: PlanGrantInput[],
  now = new Date(),
): ProductPlanCode {
  let best = productPlanCode(stripePlan);
  for (const grant of grants) {
    if (grant.endsAt.getTime() <= now.getTime()) continue;
    if (planRank(grant.planCode) > planRank(best)) best = productPlanCode(grant.planCode);
  }
  return best;
}

export function pickActiveGrant(grants: PlanGrantInput[], now = new Date()) {
  const live = grants.filter((grant) => grant.endsAt.getTime() > now.getTime());
  if (live.length === 0) return null;
  return live.reduce((best, grant) => {
    const rankDiff = planRank(grant.planCode) - planRank(best.planCode);
    if (rankDiff > 0) return grant;
    if (rankDiff === 0 && grant.endsAt.getTime() > best.endsAt.getTime()) return grant;
    return best;
  });
}

export function remainingGrantDays(endsAt: Date, now = new Date()) {
  return Math.max(0, Math.ceil((endsAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
}
