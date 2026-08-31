import { prisma } from "@/lib/db/prisma";
import type { Prisma, ProjectStatus } from "@/generated/prisma/client";
import { visibleProjectWhere } from "@/lib/data/visibility";

const PAGE_SIZE = 24;

export async function listProjects(params: {
  workspaceId: string;
  q?: string;
  status?: string;
  archived?: boolean;
  page?: number;
}) {
  const page = Math.max(1, params.page ?? 1);
  const where: Prisma.ProjectWhereInput = {
    ...visibleProjectWhere(params.workspaceId),
    archivedAt: params.archived ? { not: null } : null,
    name: params.q ? { contains: params.q, mode: "insensitive" } : undefined,
    status: params.status && params.status !== "ARCHIVED" ? (params.status as ProjectStatus) : undefined,
  };
  const [items, total] = await Promise.all([
    prisma.project.findMany({
      where,
      include: { sourceVideo: true, _count: { select: { clips: true } } },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.project.count({ where }),
  ]);
  return { items, total, page, pageSize: PAGE_SIZE, pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}

export async function renameProject(workspaceId: string, projectId: string, name: string) {
  const project = await prisma.project.findFirst({ where: { id: projectId, workspaceId } });
  if (!project) return null;
  const next = name.trim().slice(0, 80);
  if (next.length < 2) return project;
  return prisma.project.update({ where: { id: project.id }, data: { name: next } });
}

export async function archiveProject(workspaceId: string, projectId: string) {
  const project = await prisma.project.findFirst({ where: { id: projectId, workspaceId, archivedAt: null } });
  if (!project) return null;
  return prisma.project.update({
    where: { id: project.id },
    data: { archivedAt: new Date(), status: project.status === "PROCESSING" ? "CANCELED" : project.status },
  });
}

export async function restoreProject(workspaceId: string, projectId: string) {
  const project = await prisma.project.findFirst({ where: { id: projectId, workspaceId } });
  if (!project) return null;
  return prisma.project.update({ where: { id: project.id }, data: { archivedAt: null } });
}

export async function deleteProject(workspaceId: string, projectId: string) {
  const project = await prisma.project.findFirst({ where: { id: projectId, workspaceId } });
  if (!project) return null;
  await prisma.project.delete({ where: { id: project.id } });
  return project;
}
