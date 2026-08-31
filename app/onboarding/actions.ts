"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import {
  ONBOARDING_STEPS,
  clampOnboardingStep,
  parseOnboardingGoal,
  parseOnboardingPlan,
  parseOnboardingPlatforms,
} from "@/lib/onboarding/config";

async function completeOnboarding(
  userId: string,
  extra: { primaryGoal?: string; userType?: string; step?: number } = {},
) {
  await prisma.user.update({
    where: { id: userId },
    data: {
      onboardingCompleted: true,
      onboardingCompletedAt: new Date(),
      onboardingStep: extra.step ?? ONBOARDING_STEPS,
      ...(extra.primaryGoal ? { primaryGoal: extra.primaryGoal } : {}),
      ...(extra.userType ? { userType: extra.userType } : {}),
    },
  });
}

export async function saveOnboardingAction(formData: FormData) {
  const user = await requireUser();
  const step = clampOnboardingStep(formData.get("step"));
  const workspaceName = String(formData.get("workspaceName") ?? "").trim();
  const primaryGoal = parseOnboardingGoal(String(formData.get("primaryGoal") ?? ""));
  const platforms = parseOnboardingPlatforms(formData.getAll("platforms").map(String));
  const plan = parseOnboardingPlan(String(formData.get("plan") ?? ""));

  if (workspaceName.length >= 2) {
    const membership = await prisma.workspaceMember.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: "asc" },
    });
    if (membership) {
      await prisma.workspace.update({
        where: { id: membership.workspaceId },
        data: { name: workspaceName.slice(0, 80) },
      });
    }
  }

  const extra = {
    ...(primaryGoal ? { primaryGoal } : {}),
    ...(platforms ? { userType: platforms } : {}),
  };

  if (step === 5) {
    await prisma.user.update({
      where: { id: user.id },
      data: {
        onboardingStep: 6,
        ...extra,
      },
    });
    redirect(`/onboarding?step=6&plan=${plan}`);
  }

  if (step >= ONBOARDING_STEPS) {
    await completeOnboarding(user.id, { ...extra, step: ONBOARDING_STEPS });
    if (plan === "CREATOR" || plan === "PRO") {
      redirect(`/studio/settings/billing?plan=${plan}`);
    }
    redirect("/studio");
  }

  const nextStep = clampOnboardingStep(step + 1);
  await prisma.user.update({
    where: { id: user.id },
    data: {
      onboardingStep: nextStep,
      ...extra,
    },
  });
  redirect(`/onboarding?step=${nextStep}`);
}
