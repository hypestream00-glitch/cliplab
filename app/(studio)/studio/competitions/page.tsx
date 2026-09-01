import Link from "next/link";
import { requireWorkspaceContext } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { PageHeader, EmptyState } from "@/components/dashboard/primitives";
import { CompetitionStatusBadge } from "@/components/competitions/status-badge";
import { formatBrlFromCents } from "@/lib/competitions/prizes";
import { formatDate } from "@/lib/utils/format";
import { publicCompetitionStatuses } from "@/lib/competitions/status";
import { refreshCompetitionStatuses } from "@/lib/competitions/admin";

export const metadata = { title: "Campeonatos" };

export default async function CompetitionsPage() {
  await requireWorkspaceContext();
  await refreshCompetitionStatuses();
  const items = await prisma.competition.findMany({
    where: { status: { in: [...publicCompetitionStatuses()] } },
    orderBy: [{ status: "asc" }, { startsAt: "desc" }],
    include: {
      _count: { select: { participants: true, submissions: true } },
    },
  });
  const viewSums = items.length
    ? await prisma.competitionSubmission.groupBy({
        by: ["competitionId"],
        where: {
          competitionId: { in: items.map((item) => item.id) },
          status: "VERIFIED",
          metricsAvailable: true,
        },
        _sum: { latestViews: true },
      })
    : [];
  const viewsByCompetition = new Map(viewSums.map((row) => [row.competitionId, row._sum.latestViews ?? 0]));
  return (
    <div>
      <PageHeader
        title="🏆 Campeonatos de Clipadores"
        description="Crie clips, publique nas suas redes e dispute premiações."
      />
      {items.length === 0 ? (
        <EmptyState
          title="Nenhum campeonato aberto agora."
          description="Quando um desafio for publicado, ele aparece aqui com ranking e prêmios."
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {items.map((item) => {
            const views = viewsByCompetition.get(item.id) ?? 0;
            return (
              <article key={item.id} className="overflow-hidden rounded-2xl border bg-card hover:border-primary/40">
                {item.bannerUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.bannerUrl} alt="" className="h-28 w-full object-cover" />
                ) : (
                  <div className="h-20 gradient-brand opacity-40" />
                )}
                <div className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <h2 className="text-[15px] font-semibold">{item.name}</h2>
                    <CompetitionStatusBadge status={item.status} />
                  </div>
                  <p className="mt-1 text-[18px] font-semibold text-yellow-300">{formatBrlFromCents(item.prizePoolCents)}</p>
                  <p className="mt-2 text-[12px] text-muted-foreground">
                    {formatDate(item.startsAt)} — {formatDate(item.endsAt)}
                  </p>
                  <p className="mt-1 text-[12px] text-muted-foreground">
                    {item._count.participants} participantes · {views.toLocaleString("pt-BR")} views · {item.allowedPlatforms.join(", ")}
                  </p>
                  <Link href={`/studio/competitions/${item.slug}`} className="mt-3 inline-flex h-9 items-center rounded-lg border px-3 text-[13px]">
                    Ver campeonato
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
