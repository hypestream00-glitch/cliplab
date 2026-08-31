import { prisma } from "@/lib/db/prisma";
import { PLAN_LIMITS, type PlanCode } from "@/lib/config/plans";

export async function ensureProductPlans() {
  for (const plan of Object.values(PLAN_LIMITS)) {
    await prisma.plan.upsert({
      where: { code: plan.code as PlanCode },
      create: {
        code: plan.code as PlanCode,
        name: plan.name,
        active: true,
        limits: plan as object,
      },
      update: {
        name: plan.name,
        active: ["FREE", "CREATOR", "PRO"].includes(plan.code),
        limits: plan as object,
      },
    });
  }
}
