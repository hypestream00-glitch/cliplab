import { prisma } from "@/lib/db/prisma";
import { allocateViewsPrizes, estimateRankingPrize } from "@/lib/competitions/prizes";
import { rankParticipants } from "@/lib/competitions/ranking";

export async function getCompetitionRanking(competitionId: string) {
  const competition = await prisma.competition.findUnique({
    where: { id: competitionId },
    include: { prizeRules: true, participants: { include: { user: true, submissions: true } } },
  });
  if (!competition) return [];
  const rows = competition.participants
    .filter((participant) => participant.status === "ACTIVE")
    .map((participant) => {
      const valid = participant.submissions.filter((item) => item.status === "VERIFIED" && item.metricsAvailable);
      const validViews = valid.reduce((sum, item) => sum + (item.latestViews ?? 0), 0);
      return {
        participantId: participant.id,
        userId: participant.userId,
        displayName: participant.user.name ?? participant.user.email ?? "Clipador",
        avatarUrl: participant.user.image,
        validViews,
        validClips: valid.length,
      };
    });
  const ranked = rankParticipants(rows);
  const viewsBudget =
    competition.prizeMode === "RANKING"
      ? 0
      : competition.viewsBudgetCents || (competition.prizeMode === "VIEWS" ? competition.prizePoolCents : 0);
  const viewsPrizes = allocateViewsPrizes({
    views: ranked.map((row) => row.validViews),
    rules: competition.prizeRules,
    viewsBudgetCents: viewsBudget,
  });
  return ranked.map((row, index) => {
    const rankingPrize = competition.prizeMode === "VIEWS" ? 0 : estimateRankingPrize(competition.prizeRules, row.position);
    const viewsPrize = competition.prizeMode === "RANKING" ? 0 : (viewsPrizes[index] ?? 0);
    return { ...row, estimatedPrizeCents: rankingPrize + viewsPrize };
  });
}
