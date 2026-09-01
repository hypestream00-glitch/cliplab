import Link from "next/link";
import { notFound } from "next/navigation";
import { requireWorkspaceContext } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { PageHeader } from "@/components/dashboard/primitives";
import { CompetitionStatusBadge } from "@/components/competitions/status-badge";
import { LineMetricChart } from "@/components/charts/metric-charts";
import { formatBrlFromCents } from "@/lib/competitions/prizes";
import { formatNumber } from "@/lib/utils/format";
import { getCompetitionRanking } from "@/lib/competitions/query";
import type { PageParamsProps } from "@/types/routes";

export const metadata = { title: "Meu desempenho" };

export default async function CompetitionMePage({ params }: PageParamsProps<{ slug: string }>) {
  const ctx = await requireWorkspaceContext();
  const { slug } = await params;
  const competition = await prisma.competition.findUnique({ where: { slug } });
  if (!competition) notFound();
  const participant = await prisma.competitionParticipant.findUnique({
    where: { competitionId_userId: { competitionId: competition.id, userId: ctx.user.id } },
    include: { submissions: { include: { metrics: { orderBy: { capturedAt: "asc" } } } } },
  });
  if (!participant) notFound();
  const ranking = await getCompetitionRanking(competition.id);
  const mine = ranking.find((row) => row.participantId === participant.id);
  const submissions = participant.submissions;
  const series = submissions
    .flatMap((item) => item.metrics.filter((metric) => metric.views != null).map((metric) => ({
      label: metric.capturedAt.toISOString().slice(5, 16),
      value: metric.views ?? 0,
    })))
    .slice(-24);
  return (
    <div className="space-y-6">
      <PageHeader
        title="Meu desempenho"
        description={competition.name}
        actions={
          <Link href={`/studio/competitions/${slug}`} className="text-[13px] text-primary">
            Voltar ao campeonato
          </Link>
        }
      />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <article className="rounded-2xl border bg-card p-4">
          <p className="text-[12px] text-muted-foreground">Sua posição</p>
          <p className="mt-1 text-[20px] font-semibold">{mine?.position ?? "—"}</p>
        </article>
        <article className="rounded-2xl border bg-card p-4">
          <p className="text-[12px] text-muted-foreground">Views válidas</p>
          <p className="mt-1 text-[20px] font-semibold">{formatNumber(mine?.validViews ?? 0)}</p>
        </article>
        <article className="rounded-2xl border bg-card p-4">
          <p className="text-[12px] text-muted-foreground">Código de participação</p>
          <p className="mt-1 font-mono text-[18px] font-semibold text-yellow-300">{participant.participantCode}</p>
        </article>
        <article className="rounded-2xl border bg-card p-4">
          <p className="text-[12px] text-muted-foreground">Prêmio estimado</p>
          <p className="mt-1 text-[20px] font-semibold text-yellow-300">{formatBrlFromCents(mine?.estimatedPrizeCents ?? 0)}</p>
        </article>
      </div>
      <div className="grid gap-3 sm:grid-cols-4">
        <article className="rounded-xl border bg-card p-3 text-[13px]">Enviados {submissions.length}</article>
        <article className="rounded-xl border bg-card p-3 text-[13px]">Aprovados {submissions.filter((item) => item.status === "VERIFIED").length}</article>
        <article className="rounded-xl border bg-card p-3 text-[13px]">Em análise {submissions.filter((item) => item.status === "PENDING" || item.status === "FLAGGED").length}</article>
        <article className="rounded-xl border bg-card p-3 text-[13px]">Rejeitados {submissions.filter((item) => item.status === "REJECTED").length}</article>
      </div>
      <section className="rounded-2xl border bg-card p-4">
        <h2 className="mb-2 text-[14px] font-semibold">Evolução de views</h2>
        <LineMetricChart data={series} />
      </section>
      <div className="space-y-2">
        {submissions.map((item) => (
          <article key={item.id} className="rounded-xl border bg-card p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <a href={item.postUrl} className="text-[13px] text-primary" target="_blank" rel="noreferrer">
                {item.platform} · {item.postExternalId}
              </a>
              <CompetitionStatusBadge status={item.status} />
            </div>
            <p className="mt-1 text-[12px] text-muted-foreground">
              {item.metricsAvailable ? `${formatNumber(item.latestViews ?? 0)} views oficiais` : "Métricas ainda não disponíveis automaticamente."}
            </p>
          </article>
        ))}
      </div>
    </div>
  );
}
