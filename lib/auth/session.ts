import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { cookies } from "next/headers";
import type { WorkspaceRole } from "@/generated/prisma/client";
import {
  configuredOwnerDisplayName,
  isSeedDisplayName,
  isSeedWorkspaceName,
  toSessionIdentity,
} from "@/lib/auth/identity";
import { canManageBilling } from "@/lib/billing/policy";

export async function getSessionUser() {
  const session = await auth();
  if (!session?.user?.id) return null;
  return session.user;
}

export async function requireUser() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireAdmin() {
  const user = await requireUser();
  if (user.role !== "SUPER_ADMIN") redirect("/studio");
  return user;
}

export async function getActiveWorkspaceId() {
  const cookieStore = await cookies();
  return cookieStore.get("cliplab.workspace")?.value ?? null;
}

export async function requireWorkspaceContext() {
  const sessionUser = await requireUser();
  const memberships = await prisma.workspaceMember.findMany({
    where: { userId: sessionUser.id },
    include: { workspace: true },
    orderBy: { createdAt: "asc" },
  });
  if (memberships.length === 0) {
    redirect("/onboarding");
  }
  const requested = await getActiveWorkspaceId();
  const current =
    memberships.find((m) => m.workspaceId === requested) ?? memberships[0];

  if (isSeedDisplayName(sessionUser.name)) {
    const nextName = configuredOwnerDisplayName();
    await prisma.user.update({
      where: { id: sessionUser.id },
      data: { name: nextName },
    });
    sessionUser.name = nextName;
  }
  if (current.role === "OWNER" && isSeedWorkspaceName(current.workspace.name)) {
    await prisma.workspace.update({
      where: { id: current.workspace.id },
      data: { name: "Workspace pessoal" },
    });
    current.workspace.name = "Workspace pessoal";
  }

  const identity = toSessionIdentity(sessionUser);
  return {
    user: { ...sessionUser, name: identity.name, email: identity.email ?? sessionUser.email, image: identity.image },
    membership: current,
    workspace: current.workspace,
    role: current.role as WorkspaceRole,
    memberships,
  };
}

export async function requireBillingOwner() {
  const ctx = await requireWorkspaceContext();
  if (!canManageBilling(ctx.role)) {
    redirect("/studio/settings/billing?error=forbidden");
  }
  return ctx;
}
