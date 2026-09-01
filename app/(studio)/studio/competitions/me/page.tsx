import Link from "next/link";
import { requireWorkspaceContext } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { PageHeader, EmptyState } from "@/components/dashboard/primitives";
import { CompetitionStatusBadge } from "@/components/competitions/status-badge";
import { formatBrlFromCents } from "@/lib/competitions/prizes";

export const metadata = { title: "Minhas participações" };

export default async function MyCompetitionsPage() {
  const ctx = await requireWorkspaceContext();
  const rows = await prisma.competitionParticipant.findMany({
    where: { userId: ctx.user.id, workspaceId: ctx.workspace.id },
    include: {
      competition: true,
      submissions: { select: { status: true, latestViews: true, metricsAvailable: true } },
    },
    orderBy: { joinedAt: "desc" },
  });
  return (
    <div>
      <PageHeader title="Minhas participações" description="Códigos, envios e desempenho nos campeonatos que você entrou." />
      {rows.length === 0 ? (
        <EmptyState
          title="Você ainda não entrou em um campeonato."
          description="Abra Campeonatos, aceite as regras e publique com o código de participação."
        />
      ) : (
        <div className="space-y-3">
          {rows.map((row) => {
            const views = row.submissions
              .filter((item) => item.metricsAvailable)
              .reduce((sum, item) => sum + (item.latestViews ?? 0), 0);
            return (
              <article key={row.id} className="rounded-2xl border border-border bg-card p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-[15px] font-semibold">{row.competition.name}</h2>
                    <p className="mt-1 font-mono text-[13px] text-yellow-300">{row.participantCode}</p>
                    <p className="mt-1 text-[12px] text-muted-foreground">
                      {row.submissions.length} envios · {views.toLocaleString("pt-BR")} views · {formatBrlFromCents(row.competition.prizePoolCents)}
                    </p>
                  </div>
                  <CompetitionStatusBadge status={row.competition.status} />
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Link href={`/studio/competitions/${row.competition.slug}`} className="text-[13px] text-primary">
                    Ver campeonato
                  </Link>
                  <Link href={`/studio/competitions/${row.competition.slug}/me`} className="text-[13px] text-primary">
                    Meu desempenho
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
