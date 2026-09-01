import Link from "next/link";
import { requireWorkspaceContext } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { PageHeader, EmptyState } from "@/components/dashboard/primitives";
import { CompetitionStatusBadge } from "@/components/competitions/status-badge";
import { formatBrlFromCents } from "@/lib/competitions/prizes";
import { formatDate } from "@/lib/utils/format";
import type { PageSearchProps } from "@/types/routes";
import { publicCompetitionStatuses } from "@/lib/competitions/status";
import { refreshCompetitionStatuses } from "@/lib/competitions/admin";

export const metadata = { title: "Campeonatos" };

export default async function CompetitionsPage({ searchParams }: PageSearchProps) {
  const ctx = await requireWorkspaceContext();
  await refreshCompetitionStatuses();
  const params = await searchParams;
  const tab = typeof params.tab === "string" ? params.tab : "ativos";
  const statusFilter =
    tab === "em-breve"
      ? (["SCHEDULED"] as const)
      : tab === "encerrados"
        ? (["FINALIZING", "FINISHED"] as const)
        : tab === "minhas"
          ? publicCompetitionStatuses()
          : (["ACTIVE"] as const);
  const items = await prisma.competition.findMany({
    where:
      tab === "minhas"
        ? { participants: { some: { userId: ctx.user.id } } }
        : { status: { in: [...statusFilter] } },
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
      <nav className="mb-4 flex flex-wrap gap-2 text-[13px]">
        {[
          ["ativos", "Ativos"],
          ["em-breve", "Em breve"],
          ["encerrados", "Encerrados"],
          ["minhas", "Minhas participações"],
        ].map(([id, label]) => (
          <Link
            key={id}
            href={`/studio/competitions?tab=${id}`}
            className={`rounded-xl border px-3 py-1.5 ${tab === id ? "border-gold/50 bg-gold/10 text-white" : "border-border text-muted-foreground"}`}
          >
            {label}
          </Link>
        ))}
      </nav>
      {items.length === 0 ? (
        <EmptyState
          title="Nenhum campeonato aberto agora."
          description="Quando um desafio for publicado, ele aparece aqui com ranking e prêmios."
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {items.map((item) => {
            const views = viewsByCompetition.get(item.id) ?? 0;
            return (
              <article key={item.id} className="overflow-hidden rounded-2xl border border-gold/25 bg-card hover:border-gold/45">
                {item.bannerUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.bannerUrl} alt="" className="h-28 w-full object-cover" />
                ) : (
                  <div className="h-20 gradient-brand opacity-40" />
                )}
                <div className="p-5">
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
                  <Link href={`/studio/competitions/${item.slug}`} className="mt-4 inline-flex h-10 items-center rounded-xl gradient-brand px-4 text-[13px] font-semibold text-white">
                    {tab === "encerrados" ? "Ver campeonato" : "Participar"}
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
