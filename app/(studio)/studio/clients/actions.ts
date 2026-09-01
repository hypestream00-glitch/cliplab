"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireWorkspaceContext } from "@/lib/auth/session";
import { createClient, deleteClient } from "@/lib/services/clients";

export async function createClientAction(formData: FormData) {
  const ctx = await requireWorkspaceContext();
  try {
    await createClient({
      workspaceId: ctx.workspace.id,
      name: String(formData.get("name") ?? ""),
      brandKitId: String(formData.get("brandKitId") ?? "") || null,
    });
  } catch (error) {
    redirect(`/studio/clients?error=${encodeURIComponent(error instanceof Error ? error.message : "Falha ao criar")}`);
  }
  revalidatePath("/studio/clients");
  redirect("/studio/clients");
}

export async function deleteClientAction(formData: FormData) {
  const ctx = await requireWorkspaceContext();
  await deleteClient(ctx.workspace.id, String(formData.get("id") ?? ""));
  revalidatePath("/studio/clients");
  redirect("/studio/clients");
}
