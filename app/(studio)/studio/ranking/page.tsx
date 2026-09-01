import Link from "next/link";
import { requireWorkspaceContext } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { PageHeader, EmptyState } from "@/components/dashboard/primitives";
import { formatBrlFromCents } from "@/lib/competitions/prizes";
import { formatNumber } from "@/lib/utils/format";
import { getCompetitionRanking } from "@/lib/competitions/query";
import { refreshCompetitionStatuses } from "@/lib/competitions/admin";

export const metadata = { title: "Ranking" };

export default async function RankingPage() {
  const ctx = await requireWorkspaceContext();
  await refreshCompetitionStatuses();
  const competitions = await prisma.competition.findMany({
    where: { status: { in: ["ACTIVE", "FINALIZING", "FINISHED"] } },
    orderBy: [{ status: "asc" }, { endsAt: "desc" }],
    take: 8,
  });
  const boards = await Promise.all(
    competitions.map(async (competition) => ({
      competition,
      ranking: (await getCompetitionRanking(competition.id)).slice(0, 10),
    })),
  );
  const mine = boards.flatMap((board) =>
    board.ranking
      .filter((row) => row.userId === ctx.user.id)
      .map((row) => ({ ...row, competitionName: board.competition.name, slug: board.competition.slug })),
  );
  return (
    <div className="space-y-8">
      <PageHeader
        title="Ranking"
        description="Posições com base nos últimos snapshots oficiais de métricas. Sem views inventadas."
      />
      {mine.length > 0 ? (
        <section>
          <h2 className="mb-2 text-[14px] font-semibold">Sua posição</h2>
          <div className="grid gap-3 md:grid-cols-2">
            {mine.map((row) => (
              <article key={`${row.slug}-${row.participantId}`} className="rounded-2xl border border-gold/30 bg-card p-4">
                <p className="text-[12px] text-muted-foreground">{row.competitionName}</p>
                <p className="mt-1 text-[20px] font-semibold">
                  {row.position === 1 ? "🥇" : row.position === 2 ? "🥈" : row.position === 3 ? "🥉" : `#${row.position}`}
                </p>
                <p className="text-[13px] text-muted-foreground">
                  {formatNumber(row.validViews)} views · {formatBrlFromCents(row.estimatedPrizeCents)}
                </p>
              </article>
            ))}
          </div>
        </section>
      ) : null}
      {boards.length === 0 ? (
        <EmptyState title="Nenhum ranking disponível." description="Quando um campeonato estiver ativo e tiver métricas oficiais, o ranking aparece aqui." />
      ) : (
        boards.map((board) => (
          <section key={board.competition.id} className="rounded-2xl border border-border bg-card p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="text-[15px] font-semibold">{board.competition.name}</h2>
              <Link href={`/studio/competitions/${board.competition.slug}`} className="text-[13px] text-primary">
                Ver campeonato
              </Link>
            </div>
            {board.ranking.length === 0 ? (
              <p className="text-[13px] text-muted-foreground">Ainda não há views oficiais neste campeonato.</p>
            ) : (
              <ol className="space-y-2">
                {board.ranking.map((row) => (
                  <li key={row.participantId} className="flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-2 text-[13px]">
                    <span className="font-medium">
                      {row.position <= 3 ? ["🥇", "🥈", "🥉"][row.position - 1] : row.position}. {row.displayName}
                    </span>
                    <span className="text-muted-foreground">
                      {formatNumber(row.validViews)} views · {formatBrlFromCents(row.estimatedPrizeCents)}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </section>
        ))
      )}
    </div>
  );
}
