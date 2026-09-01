import { prisma } from "@/lib/db/prisma";

export async function listClients(workspaceId: string) {
  return prisma.client.findMany({
    where: { workspaceId },
    include: { brandKit: true, _count: { select: { projects: true, socialAccounts: true } } },
    orderBy: { name: "asc" },
  });
}

export async function createClient(params: { workspaceId: string; name: string; brandKitId?: string | null }) {
  const name = params.name.trim().slice(0, 80);
  if (name.length < 2) throw new Error("Informe o nome do cliente.");
  if (params.brandKitId) {
    const kit = await prisma.brandKit.findFirst({ where: { id: params.brandKitId, workspaceId: params.workspaceId } });
    if (!kit) throw new Error("Brand Kit inválido.");
  }
  return prisma.client.create({
    data: {
      workspaceId: params.workspaceId,
      name,
      brandKitId: params.brandKitId || null,
    },
  });
}

export async function deleteClient(workspaceId: string, id: string) {
  const existing = await prisma.client.findFirst({ where: { id, workspaceId } });
  if (!existing) throw new Error("Cliente não encontrado.");
  await prisma.project.updateMany({ where: { clientId: id, workspaceId }, data: { clientId: null } });
  await prisma.socialAccount.updateMany({ where: { clientId: id, workspaceId }, data: { clientId: null } });
  await prisma.client.delete({ where: { id } });
}
