"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireWorkspaceContext } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { rotateUserPassword } from "@/lib/auth/rotate-password";
import { changePasswordSchema } from "@/lib/validations";

export async function updateProfileAction(formData: FormData) {
  const ctx = await requireWorkspaceContext();
  const name = String(formData.get("name") ?? "").trim();
  const language = String(formData.get("language") ?? "pt-BR");
  const timezone = String(formData.get("timezone") ?? "America/Sao_Paulo");
  await prisma.user.update({
    where: { id: ctx.user.id },
    data: { name: name || ctx.user.name, language, timezone },
  });
  revalidatePath("/studio/settings/profile");
  revalidatePath("/studio/settings/account");
  const redirectTo = String(formData.get("redirectTo") ?? "/studio/settings/profile");
  redirect(redirectTo.includes("/studio/settings/") ? `${redirectTo}?saved=1` : "/studio/settings/profile?saved=1");
}

export async function updateWorkspaceAction(formData: FormData) {
  const ctx = await requireWorkspaceContext();
  const name = String(formData.get("name") ?? "").trim();
  const timezone = String(formData.get("timezone") ?? "").trim();
  if (name.length >= 2) {
    await prisma.workspace.update({ where: { id: ctx.workspace.id }, data: { name } });
  }
  if (timezone.length >= 3) {
    await prisma.user.update({ where: { id: ctx.user.id }, data: { timezone } });
  }
  revalidatePath("/studio/settings/workspace");
  redirect("/studio/settings/workspace?saved=1");
}

export async function changePasswordAction(formData: FormData) {
  const ctx = await requireWorkspaceContext();
  const redirectBase = String(formData.get("redirectTo") ?? "/studio/settings/security");
  const safeBase = redirectBase.startsWith("/studio/settings/") ? redirectBase : "/studio/settings/security";
  const parsed = changePasswordSchema.safeParse({
    currentPassword: formData.get("currentPassword"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) {
    redirect(`${safeBase}?error=invalid`);
  }
  const dbUser = await prisma.user.findUnique({
    where: { id: ctx.user.id },
    select: { passwordHash: true },
  });
  if (!dbUser?.passwordHash) {
    redirect(`${safeBase}?error=oauth`);
  }
  const matches = await verifyPassword(parsed.data.currentPassword, dbUser.passwordHash as string);
  if (!matches) {
    redirect(`${safeBase}?error=current`);
  }
  await rotateUserPassword(ctx.user.id, await hashPassword(parsed.data.password));
  revalidatePath("/studio/settings/security");
  revalidatePath("/studio/settings/account");
  redirect(`${safeBase}?saved=1`);
}

export async function deleteWorkspaceAction(formData: FormData) {
  const ctx = await requireWorkspaceContext();
  if (ctx.role !== "OWNER") {
    redirect("/studio/settings/workspace");
  }
  const confirmName = String(formData.get("confirmName") ?? "").trim();
  if (confirmName !== ctx.workspace.name) {
    redirect("/studio/settings/workspace?error=name");
  }
  if (ctx.memberships.length < 2) {
    redirect("/studio/settings/workspace?error=last");
  }
  await prisma.workspace.delete({ where: { id: ctx.workspace.id } });
  redirect("/studio");
}

export async function saveNotificationPrefsAction(formData: FormData) {
  const ctx = await requireWorkspaceContext();
  const prefs = {
    clipsReady: formData.get("clipsReady") === "on",
    processingFailed: formData.get("processingFailed") === "on",
    publishing: formData.get("publishing") === "on",
    creditsLow: formData.get("creditsLow") === "on",
    teamInvites: formData.get("teamInvites") === "on",
    billing: formData.get("billing") === "on",
  };
  await prisma.user.update({
    where: { id: ctx.user.id },
    data: { notificationPrefs: prefs },
  });
  await prisma.auditLog.create({
    data: {
      userId: ctx.user.id,
      workspaceId: ctx.workspace.id,
      action: "NOTIFICATION_PREFS_UPDATED",
      entityType: "User",
      entityId: ctx.user.id,
      metadata: prefs,
    },
  });
  revalidatePath("/studio/settings/notifications");
  redirect("/studio/settings/notifications?saved=1");
}
