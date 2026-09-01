import { prisma } from "@/lib/db/prisma";
import { getCompetitionRanking } from "@/lib/competitions/query";
import { writeCompetitionAudit } from "@/lib/competitions/audit";
import { syncCompetitionSubmissionMetrics } from "@/lib/competitions/sync";
import { notifyWorkspace } from "@/lib/services/notifications";

export async function finalizeCompetition(competitionId: string, actorUserId: string) {
  const competition = await prisma.competition.findUnique({ where: { id: competitionId } });
  if (!competition) return { ok: false as const, error: "Campeonato não encontrado." };
  await prisma.competition.update({
    where: { id: competitionId },
    data: { status: "FINALIZING" },
  });
  await syncCompetitionSubmissionMetrics(100);
  const pending = await prisma.competitionSubmission.count({
    where: { competitionId, status: "PENDING" },
  });
  if (pending > 0) {
    await writeCompetitionAudit({
      competitionId,
      actorUserId,
      action: "COMPETITION_FINALIZING",
      entityType: "Competition",
      entityId: competitionId,
      metadata: { pending },
    });
    return { ok: true as const, status: "FINALIZING" as const, pending };
  }
  const ranking = await getCompetitionRanking(competitionId);
  await prisma.competitionPayout.deleteMany({ where: { competitionId, status: "PENDING" } });
  for (const row of ranking) {
    if (row.estimatedPrizeCents <= 0) continue;
    await prisma.competitionPayout.create({
      data: {
        competitionId,
        participantId: row.participantId,
        userId: row.userId,
        amountCents: row.estimatedPrizeCents,
        kind: competition.prizeMode,
        position: row.position,
        status: "PENDING",
      },
    });
  }
  await prisma.competition.update({
    where: { id: competitionId },
    data: { status: "FINISHED", finalizedAt: new Date() },
  });
  await writeCompetitionAudit({
    competitionId,
    actorUserId,
    action: "COMPETITION_FINISHED",
    entityType: "Competition",
    entityId: competitionId,
  });
  const participants = await prisma.competitionParticipant.findMany({ where: { competitionId } });
  for (const participant of participants) {
    await notifyWorkspace({
      workspaceId: participant.workspaceId,
      type: "COMPETITION",
      title: "Campeonato encerrado",
      body: `${competition.name} foi finalizado. Confira o ranking e o prêmio estimado.`,
      entityType: "Competition",
      entityId: competitionId,
    }).catch(() => undefined);
  }
  return { ok: true as const, status: "FINISHED" as const, pending: 0 };
}
