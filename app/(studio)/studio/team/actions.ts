"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { requireUser, requireWorkspaceContext } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { randomToken } from "@/lib/security/crypto";
import type { WorkspaceRole } from "@/generated/prisma/client";

const ROLES = new Set<WorkspaceRole>(["ADMIN", "EDITOR", "VIEWER"]);

export async function inviteMemberAction(formData: FormData) {
  const ctx = await requireWorkspaceContext();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const role = String(formData.get("role") ?? "EDITOR") as WorkspaceRole;
  if (!email || !email.includes("@") || !ROLES.has(role)) {
    redirect("/studio/team");
  }

  await prisma.workspaceInvitation.create({
    data: {
      workspaceId: ctx.workspace.id,
      email,
      role,
      token: randomToken(24),
      invitedById: ctx.user.id,
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7),
      status: "PENDING",
    },
  });

  await prisma.auditLog.create({
    data: {
      userId: ctx.user.id,
      workspaceId: ctx.workspace.id,
      action: "MEMBER_INVITED",
      entityType: "WorkspaceInvitation",
      metadata: { email, role },
    },
  });

  revalidatePath("/studio/team");
  redirect("/studio/team");
}

export async function acceptInvitationAction(formData: FormData) {
  const user = await requireUser();
  const token = String(formData.get("token") ?? "");
  const invite = await prisma.workspaceInvitation.findUnique({ where: { token } });
  if (!invite || invite.status !== "PENDING") {
    redirect("/studio/team/accept?error=invalid");
  }
  if (invite.expiresAt < new Date()) {
    redirect("/studio/team/accept?error=expired");
  }
  const email = user.email?.trim().toLowerCase();
  if (!email || email !== invite.email.toLowerCase()) {
    redirect("/studio/team/accept?error=email");
  }
  await prisma.$transaction([
    prisma.workspaceMember.upsert({
      where: { workspaceId_userId: { workspaceId: invite.workspaceId, userId: user.id } },
      create: { workspaceId: invite.workspaceId, userId: user.id, role: invite.role },
      update: { role: invite.role },
    }),
    prisma.workspaceInvitation.update({
      where: { id: invite.id },
      data: { status: "ACCEPTED" },
    }),
    prisma.auditLog.create({
      data: {
        userId: user.id,
        workspaceId: invite.workspaceId,
        action: "MEMBER_JOINED",
        entityType: "Workspace",
        entityId: invite.workspaceId,
      },
    }),
  ]);
  const cookieStore = await cookies();
  cookieStore.set("cliplab.workspace", invite.workspaceId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  revalidatePath("/studio/team");
  redirect("/studio/team");
}
