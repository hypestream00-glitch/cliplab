import { prisma } from "@/lib/db/prisma";
import { isPrismaUniqueViolation } from "@/lib/webhooks/idempotency";
import { canJoinStatus } from "@/lib/competitions/status";
import { isAllowedCompetitionPlatform } from "@/lib/competitions/platforms";
import { writeCompetitionAudit } from "@/lib/competitions/audit";
import { generateParticipantCode } from "@/lib/competitions/codes";

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

  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      const participant = await prisma.competitionParticipant.create({
        data: {
          competitionId: params.competitionId,
          userId: params.userId,
          workspaceId: params.workspaceId,
          participantCode: generateParticipantCode(),
        },
      });
      await writeCompetitionAudit({
        competitionId: params.competitionId,
        actorUserId: params.userId,
        action: "PARTICIPANT_JOINED",
        entityType: "CompetitionParticipant",
        entityId: participant.id,
      });
      return { ok: true as const, participantId: participant.id, participantCode: participant.participantCode };
    } catch (error) {
      if (isPrismaUniqueViolation(error)) {
        const existing = await prisma.competitionParticipant.findUnique({
          where: { competitionId_userId: { competitionId: params.competitionId, userId: params.userId } },
        });
        if (existing) return { ok: false as const, error: "Você já está neste campeonato." };
        if (attempt < 7) continue;
      }
      throw error;
    }
  }
  return { ok: false as const, error: "Não foi possível gerar seu código de participação." };
}
