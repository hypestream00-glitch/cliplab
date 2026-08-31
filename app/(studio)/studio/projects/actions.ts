"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireWorkspaceContext } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { archiveProject, deleteProject, renameProject, restoreProject } from "@/lib/services/projects-crud";
import { resumeProjectProcessing } from "@/lib/services/project-retry";

export async function retryProjectAction(formData: FormData) {
  const ctx = await requireWorkspaceContext();
  const projectId = String(formData.get("projectId") ?? "");
  try {
    const result = await resumeProjectProcessing(ctx.workspace.id, projectId);
    if (!result) redirect("/studio/projects");
  } catch (error) {
    const message = error instanceof Error ? error.message : "retry";
    redirect(`/studio/projects/${projectId}?error=${encodeURIComponent(message)}`);
  }
  revalidatePath(`/studio/projects/${projectId}`);
  redirect(`/studio/projects/${projectId}`);
}

export async function renameProjectAction(formData: FormData) {
  const ctx = await requireWorkspaceContext();
  const projectId = String(formData.get("projectId") ?? "");
  const name = String(formData.get("name") ?? "");
  const updated = await renameProject(ctx.workspace.id, projectId, name);
  if (!updated) redirect("/studio/projects");
  revalidatePath("/studio/projects");
  revalidatePath(`/studio/projects/${projectId}`);
  redirect(`/studio/projects/${projectId}`);
}

export async function archiveProjectAction(formData: FormData) {
  const ctx = await requireWorkspaceContext();
  const projectId = String(formData.get("projectId") ?? "");
  const updated = await archiveProject(ctx.workspace.id, projectId);
  if (!updated) redirect("/studio/projects");
  revalidatePath("/studio/projects");
  revalidatePath(`/studio/projects/${projectId}`);
  redirect("/studio/projects?filter=archived");
}

export async function restoreProjectAction(formData: FormData) {
  const ctx = await requireWorkspaceContext();
  const projectId = String(formData.get("projectId") ?? "");
  await restoreProject(ctx.workspace.id, projectId);
  revalidatePath("/studio/projects");
  revalidatePath(`/studio/projects/${projectId}`);
  redirect("/studio/projects");
}

export async function deleteProjectAction(formData: FormData) {
  const ctx = await requireWorkspaceContext();
  const projectId = String(formData.get("projectId") ?? "");
  const confirmName = String(formData.get("confirmName") ?? "").trim();
  const project = await prisma.project.findFirst({ where: { id: projectId, workspaceId: ctx.workspace.id } });
  if (!project) redirect("/studio/projects");
  if (confirmName !== project.name) {
    redirect(`/studio/projects/${projectId}?error=confirm`);
  }
  await deleteProject(ctx.workspace.id, projectId);
  revalidatePath("/studio/projects");
  redirect("/studio/projects");
}
