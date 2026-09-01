"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireWorkspaceContext } from "@/lib/auth/session";
import { createBrandKit, deleteBrandKit, updateBrandKit } from "@/lib/services/brand-kit";

export async function createBrandKitAction(formData: FormData) {
  const ctx = await requireWorkspaceContext();
  try {
    await createBrandKit({
      workspaceId: ctx.workspace.id,
      name: String(formData.get("name") ?? ""),
      primaryColor: String(formData.get("primaryColor") ?? "#E92ACB"),
      secondaryColor: String(formData.get("secondaryColor") ?? "#8B3DFF"),
      fonts: String(formData.get("fonts") ?? "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
      watermark: String(formData.get("watermark") ?? ""),
      captionPreset: String(formData.get("captionPreset") ?? ""),
    });
  } catch (error) {
    redirect(`/studio/brand-kit?error=${encodeURIComponent(error instanceof Error ? error.message : "Falha ao salvar")}`);
  }
  revalidatePath("/studio/brand-kit");
  redirect("/studio/brand-kit");
}

export async function updateBrandKitAction(formData: FormData) {
  const ctx = await requireWorkspaceContext();
  try {
    await updateBrandKit({
      workspaceId: ctx.workspace.id,
      id: String(formData.get("id") ?? ""),
      name: String(formData.get("name") ?? ""),
      primaryColor: String(formData.get("primaryColor") ?? "#E92ACB"),
      secondaryColor: String(formData.get("secondaryColor") ?? "#8B3DFF"),
      fonts: String(formData.get("fonts") ?? "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
      watermark: String(formData.get("watermark") ?? ""),
      captionPreset: String(formData.get("captionPreset") ?? ""),
    });
  } catch (error) {
    redirect(`/studio/brand-kit?error=${encodeURIComponent(error instanceof Error ? error.message : "Falha ao salvar")}`);
  }
  revalidatePath("/studio/brand-kit");
  redirect("/studio/brand-kit");
}

export async function deleteBrandKitAction(formData: FormData) {
  const ctx = await requireWorkspaceContext();
  await deleteBrandKit(ctx.workspace.id, String(formData.get("id") ?? ""));
  revalidatePath("/studio/brand-kit");
  redirect("/studio/brand-kit");
}
