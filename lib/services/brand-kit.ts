import { prisma } from "@/lib/db/prisma";
import { getPlanLimits } from "@/lib/config/plans";
import { getWorkspacePlanCode } from "@/lib/billing/usage";

const MAX_KITS = 8;

export async function listBrandKits(workspaceId: string) {
  return prisma.brandKit.findMany({ where: { workspaceId }, orderBy: { name: "asc" } });
}

export async function createBrandKit(params: {
  workspaceId: string;
  name: string;
  primaryColor: string;
  secondaryColor: string;
  fonts?: string[];
  logo?: string;
  watermark?: string;
  captionPreset?: string;
}) {
  const count = await prisma.brandKit.count({ where: { workspaceId: params.workspaceId } });
  const plan = getPlanLimits(await getWorkspacePlanCode(params.workspaceId));
  const cap = Math.min(MAX_KITS, Math.max(1, plan.maxAccounts));
  if (count >= cap) throw new Error("Limite de Brand Kits do plano atingido.");
  const name = params.name.trim().slice(0, 80);
  if (name.length < 2) throw new Error("Informe um nome para o Brand Kit.");
  return prisma.brandKit.create({
    data: {
      workspaceId: params.workspaceId,
      name,
      primaryColor: params.primaryColor || "#E92ACB",
      secondaryColor: params.secondaryColor || "#8B3DFF",
      fonts: params.fonts?.filter(Boolean).slice(0, 4) ?? [],
      logo: params.logo?.trim() || null,
      watermark: params.watermark?.trim() || null,
      captionPreset: params.captionPreset?.trim() || null,
    },
  });
}

export async function updateBrandKit(params: {
  workspaceId: string;
  id: string;
  name: string;
  primaryColor: string;
  secondaryColor: string;
  fonts?: string[];
  logo?: string;
  watermark?: string;
  captionPreset?: string;
}) {
  const existing = await prisma.brandKit.findFirst({ where: { id: params.id, workspaceId: params.workspaceId } });
  if (!existing) throw new Error("Brand Kit não encontrado.");
  return prisma.brandKit.update({
    where: { id: existing.id },
    data: {
      name: params.name.trim().slice(0, 80) || existing.name,
      primaryColor: params.primaryColor || existing.primaryColor,
      secondaryColor: params.secondaryColor || existing.secondaryColor,
      fonts: params.fonts?.filter(Boolean).slice(0, 4) ?? existing.fonts,
      logo: params.logo?.trim() || null,
      watermark: params.watermark?.trim() || null,
      captionPreset: params.captionPreset?.trim() || null,
    },
  });
}

export async function deleteBrandKit(workspaceId: string, id: string) {
  const existing = await prisma.brandKit.findFirst({ where: { id, workspaceId } });
  if (!existing) throw new Error("Brand Kit não encontrado.");
  await prisma.client.updateMany({ where: { brandKitId: id, workspaceId }, data: { brandKitId: null } });
  await prisma.editorProject.updateMany({ where: { brandKitId: id, workspaceId }, data: { brandKitId: null } });
  await prisma.brandKit.delete({ where: { id } });
}
