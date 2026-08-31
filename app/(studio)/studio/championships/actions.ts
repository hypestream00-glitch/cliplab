"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireWorkspaceContext } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";

export async function createChampionshipAction(formData: FormData) {
  const ctx = await requireWorkspaceContext();
  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;
  const startRaw = String(formData.get("startAt") ?? "");
  const endRaw = String(formData.get("endAt") ?? "");
  if (!title) {
    redirect("/studio/championships/new");
  }

  const startAt = startRaw ? new Date(startRaw) : new Date();
  const endAt = endRaw ? new Date(endRaw) : new Date(Date.now() + 1000 * 60 * 60 * 24 * 14);
  if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime())) {
    redirect("/studio/championships/new");
  }

  const championship = await prisma.championship.create({
    data: {
      workspaceId: ctx.workspace.id,
      ownerId: ctx.user.id,
      title,
      description,
      startAt,
      endAt,
      status: "DRAFT",
    },
  });

  await prisma.auditLog.create({
    data: {
      userId: ctx.user.id,
      workspaceId: ctx.workspace.id,
      action: "CHAMPIONSHIP_CREATED",
      entityType: "Championship",
      entityId: championship.id,
    },
  });

  revalidatePath("/studio/championships");
  redirect(`/studio/championships/${championship.id}`);
}

export async function joinChampionshipAction(formData: FormData) {
  const ctx = await requireWorkspaceContext();
  const championshipId = String(formData.get("championshipId") ?? "");
  const championship = await prisma.championship.findFirst({
    where: { id: championshipId, workspaceId: ctx.workspace.id },
  });
  if (!championship) redirect("/studio/championships");
  await prisma.championshipParticipant.upsert({
    where: { championshipId_userId: { championshipId, userId: ctx.user.id } },
    create: {
      championshipId,
      userId: ctx.user.id,
      displayName: ctx.user.name ?? ctx.user.email ?? "Participante",
    },
    update: {},
  });
  revalidatePath(`/studio/championships/${championshipId}`);
  redirect(`/studio/championships/${championshipId}`);
}

export async function submitClipToChampionshipAction(formData: FormData) {
  const ctx = await requireWorkspaceContext();
  const championshipId = String(formData.get("championshipId") ?? "");
  const clipId = String(formData.get("clipId") ?? "");
  if (
    !(await prisma.championship.findFirst({
      where: { id: championshipId, workspaceId: ctx.workspace.id },
      select: { id: true },
    }))
  ) {
    redirect("/studio/championships");
  }
  const clip = await prisma.clip.findFirst({
    where: { id: clipId, workspaceId: ctx.workspace.id },
    include: { score: true },
  });
  if (!clip) redirect(`/studio/championships/${championshipId}`);
  const existing = await prisma.clipSubmission.findFirst({
    where: { championshipId, clipId: clip.id },
  });
  if (!existing) {
    await prisma.clipSubmission.create({
      data: {
        championshipId,
        clipId: clip.id,
        userId: ctx.user.id,
        score: clip.score?.overall ?? 0,
        views: 0,
      },
    });
  }
  revalidatePath(`/studio/championships/${championshipId}`);
  redirect(`/studio/championships/${championshipId}`);
}

export async function openChampionshipAction(formData: FormData) {
  const ctx = await requireWorkspaceContext();
  const championshipId = String(formData.get("championshipId") ?? "");
  await prisma.championship.updateMany({
    where: { id: championshipId, workspaceId: ctx.workspace.id },
    data: { status: "OPEN" },
  });
  revalidatePath(`/studio/championships/${championshipId}`);
  redirect(`/studio/championships/${championshipId}`);
}
