import { prisma } from "@/lib/db/prisma";
import { isPrismaUniqueViolation } from "@/lib/webhooks/idempotency";
import { canJoinStatus } from "@/lib/competitions/status";
import { isAllowedCompetitionPlatform } from "@/lib/competitions/platforms";
import { writeCompetitionAudit } from "@/lib/competitions/audit";

export async function joinCompetition(params: {
  competitionId: string;
  userId: string;
  workspaceId: string;
}) {
  const competition = await prisma.competition.findUnique({ where: { id: params.competitionId } });
  if (!competition) return { ok: false as const, error: "Campeonato não encontrado." };
  if (!canJoinStatus(competition.status)) {
    return { ok: false as const, error: "Este campeonato não está aberto para novas participações." };
  }
  const now = new Date();
  if (now > competition.endsAt) return { ok: false as const, error: "Este campeonato já encerrou." };

  const compatible = await prisma.socialAccount.findFirst({
    where: {
      workspaceId: params.workspaceId,
      mock: false,
      status: { in: ["CONNECTED", "TOKEN_EXPIRING"] },
      platform: { in: competition.allowedPlatforms.filter(isAllowedCompetitionPlatform) },
    },
    select: { id: true },
  });
  if (!compatible) {
    return { ok: false as const, error: "Conecte uma conta social compatível com este campeonato." };
  }

  try {
    const participant = await prisma.competitionParticipant.create({
      data: {
        competitionId: params.competitionId,
        userId: params.userId,
        workspaceId: params.workspaceId,
      },
    });
    await writeCompetitionAudit({
      competitionId: params.competitionId,
      actorUserId: params.userId,
      action: "PARTICIPANT_JOINED",
      entityType: "CompetitionParticipant",
      entityId: participant.id,
    });
    return { ok: true as const, participantId: participant.id };
  } catch (error) {
    if (isPrismaUniqueViolation(error)) return { ok: false as const, error: "Você já está neste campeonato." };
    throw error;
  }
}
