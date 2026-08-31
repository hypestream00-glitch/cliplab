"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireWorkspaceContext } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { runEnabledAutopilotRules } from "@/lib/services/publishing";

export async function createAutopilotRuleAction(formData: FormData) {
  const ctx = await requireWorkspaceContext();
  const consent = formData.get("consentGiven") === "on";
  if (!consent) {
    redirect("/studio/publishing/autopilot?error=consent");
  }
  const name = String(formData.get("name") ?? "").trim();
  if (!name) redirect("/studio/publishing/autopilot");

  await prisma.autopilotRule.create({
    data: {
      workspaceId: ctx.workspace.id,
      name,
      source: String(formData.get("source") ?? "READY_CLIPS"),
      destinations: {
        platforms: String(formData.get("destinations") ?? "TIKTOK"),
        socialAccountId: String(formData.get("socialAccountId") ?? "") || undefined,
      },
      minimumScore: Number(formData.get("minimumScore") ?? 85),
      maxPostsPerDay: Number(formData.get("maxPostsPerDay") ?? 3),
      captionPrompt: String(formData.get("captionPrompt") ?? "") || null,
      enabled: false,
      consentGiven: true,
    },
  });

  await prisma.auditLog.create({
    data: {
      userId: ctx.user.id,
      workspaceId: ctx.workspace.id,
      action: "AUTOPILOT_RULE_CREATED",
      entityType: "AutopilotRule",
      metadata: { name },
    },
  });

  revalidatePath("/studio/publishing/autopilot");
  redirect("/studio/publishing/autopilot");
}

export async function toggleAutopilotRuleAction(formData: FormData) {
  const ctx = await requireWorkspaceContext();
  const id = String(formData.get("id") ?? "");
  const rule = await prisma.autopilotRule.findFirst({
    where: { id, workspaceId: ctx.workspace.id },
  });
  if (!rule || !rule.consentGiven) {
    redirect("/studio/publishing/autopilot");
  }
  await prisma.autopilotRule.update({
    where: { id: rule.id },
    data: { enabled: !rule.enabled },
  });
  revalidatePath("/studio/publishing/autopilot");
  redirect("/studio/publishing/autopilot");
}

export async function runAutopilotNowAction() {
  const ctx = await requireWorkspaceContext();
  const rules = await prisma.autopilotRule.findMany({
    where: { workspaceId: ctx.workspace.id, enabled: true, consentGiven: true },
  });
  if (rules.length === 0) {
    redirect("/studio/publishing/autopilot?error=disabled");
  }
  const count = await runEnabledAutopilotRules(ctx.workspace.id);
  revalidatePath("/studio/publishing");
  revalidatePath("/studio/publishing/queue");
  revalidatePath("/studio/publishing/autopilot");
  redirect(count > 0 ? "/studio/publishing/queue" : "/studio/publishing/autopilot?error=empty");
}
