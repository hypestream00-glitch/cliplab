"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireWorkspaceContext } from "@/lib/auth/session";
import { applyTemplateToClips, createWorkspaceTemplate } from "@/lib/services/templates";

export async function applyTemplateAction(formData: FormData) {
  const ctx = await requireWorkspaceContext();
  const templateId = String(formData.get("templateId") ?? "");
  const clipIds = formData.getAll("clipIds").map(String).filter(Boolean);
  if (!templateId || clipIds.length === 0) {
    redirect("/studio/templates?error=clips");
  }
  await applyTemplateToClips({
    workspaceId: ctx.workspace.id,
    templateId,
    clipIds,
  });
  revalidatePath("/studio/templates");
  revalidatePath("/studio/editor");
  redirect(`/studio/editor/${clipIds[0]}`);
}

export async function createTemplateAction(formData: FormData) {
  const ctx = await requireWorkspaceContext();
  try {
    await createWorkspaceTemplate({
      workspaceId: ctx.workspace.id,
      name: String(formData.get("name") ?? ""),
      category: String(formData.get("category") ?? "Clean"),
    });
  } catch (error) {
    redirect(`/studio/templates?error=${encodeURIComponent(error instanceof Error ? error.message : "Falha ao criar")}`);
  }
  revalidatePath("/studio/templates");
  redirect("/studio/templates");
}
