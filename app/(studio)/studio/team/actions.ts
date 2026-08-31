"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireWorkspaceContext } from "@/lib/auth/session";
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
