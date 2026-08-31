"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireWorkspaceContext } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { deleteClip } from "@/lib/services/clips";
import { deleteProject } from "@/lib/services/projects-crud";

export async function deleteLibraryAssetAction(formData: FormData) {
  const ctx = await requireWorkspaceContext();
  const kind = String(formData.get("kind") ?? "");
  const id = String(formData.get("id") ?? "");
  if (kind === "clip") {
    await deleteClip(ctx.workspace.id, id);
  } else if (kind === "render") {
    const asset = await prisma.renderedAsset.findFirst({
      where: { id, clip: { workspaceId: ctx.workspace.id } },
    });
    if (asset) await prisma.renderedAsset.delete({ where: { id: asset.id } });
  } else if (kind === "upload") {
    const source = await prisma.sourceVideo.findFirst({
      where: { id, project: { workspaceId: ctx.workspace.id } },
      select: { projectId: true, project: { select: { name: true } } },
    });
    if (source) await deleteProject(ctx.workspace.id, source.projectId);
  }
  revalidatePath("/studio/library");
  redirect("/studio/library");
}
