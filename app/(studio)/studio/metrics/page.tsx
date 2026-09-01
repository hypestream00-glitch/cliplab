import Link from "next/link";
import { requireWorkspaceContext } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { PageHeader, StatCard, EmptyState } from "@/components/dashboard/primitives";
import { LineMetricChart } from "@/components/charts/metric-charts";
import { formatNumber, daysAgo } from "@/lib/utils/format";
import type { PageSearchProps } from "@/types/routes";
import { visibleMetricSnapshotWhere, visiblePublicationWhere, visibleSocialAccountWhere } from "@/lib/data/visibility";
import { realSnapshotMetric, formatMetricOrEmpty } from "@/lib/data/metrics-display";
import { getCliplabPublishedViews } from "@/lib/analytics/cliplab-views";
import { accountAnalyticsDisclaimer, cliplabViewsEmptyHint } from "@/lib/analytics/provenance";

export const metadata = { title: "Analytics" };

export default async function MetricsPage({ searchParams }: PageSearchProps) {
  const { workspace } = await requireWorkspaceContext();
  const params = await searchParams;
  const range = typeof params.range === "string" ? params.range : "30";
  const days = Number(range) || 30;
  const since = daysAgo(days);

  const [snapshots, publishedCount, cliplabViews, accounts] = await Promise.all([
    prisma.socialMetricSnapshot.findMany({
      where: { ...visibleMetricSnapshotWhere(workspace.id), capturedAt: { gte: since } },
      orderBy: { capturedAt: "asc" },
    }),
    prisma.socialPublication.count({
      where: { ...visiblePublicationWhere(workspace.id), status: "PUBLISHED", publishedAt: { gte: since } },
    }),
    getCliplabPublishedViews(workspace.id),
    prisma.socialAccount.findMany({
      where: visibleSocialAccountWhere(workspace.id),
      include: { metricSnaps: { orderBy: { capturedAt: "desc" }, take: 1 } },
    }),
  ]);
  const latest = snapshots.at(-1);
  const accountViews = realSnapshotMetric(latest, "views");
  const likes = realSnapshotMetric(latest, "likes");
  const comments = realSnapshotMetric(latest, "comments");
  const shares = realSnapshotMetric(latest, "shares");
  const series = snapshots
    .map((item) => {
      const value = realSnapshotMetric(item, "views");
      if (value == null) return null;
      return { label: item.capturedAt.toISOString().slice(5, 10), value };
    })
    .filter((item): item is { label: string; value: number } => Boolean(item))
    .slice(-14);
  const connectedAccountCount = accounts.length;

  return (
    <div>
      <PageHeader title="Analytics" description="Separe o desempenho do conteúdo CortaClip das métricas da conta social conectada." />
      <nav className="mb-1 flex gap-1 rounded-lg bg-muted p-[3px] text-[13px]">
        <Link href="/studio/analytics" className="rounded-md bg-background px-3 py-1 font-medium shadow-sm">
          Visão geral
        </Link>
        <Link href="/studio/metrics/accounts" className="rounded-md px-3 py-1 text-muted-foreground hover:text-foreground">
          Contas
        </Link>
        <Link href="/studio/metrics/content" className="rounded-md px-3 py-1 text-muted-foreground hover:text-foreground">
          Conteúdo
        </Link>
      </nav>
      <form className="my-4 flex gap-2 text-[13px]">
        {["7", "30", "90"].map((value) => (
          <Link key={value} href={`/studio/analytics?range=${value}`} className={`filter-chip ${range === value ? "filter-chip-active" : ""}`}>
            {value} dias
          </Link>
        ))}
      </form>

      <section className="mt-2">
        <h2 className="mb-2 text-[15px] font-semibold tracking-tight">Analytics do conteúdo CortaClip</h2>
        <p className="mb-3 text-[13px] text-muted-foreground">Somente publicações feitas pelo CortaClip.</p>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-2">
          <StatCard label="Publicações CortaClip" value={formatNumber(publishedCount)} />
          <StatCard
            label="Visualizações"
            value={formatMetricOrEmpty(cliplabViews, cliplabViews != null ? formatNumber(cliplabViews) : "—")}
            hint={cliplabViews == null ? cliplabViewsEmptyHint() : undefined}
          />
        </div>
      </section>

      {connectedAccountCount > 0 ? (
        <section className="mt-8">
          <h2 className="mb-2 text-[15px] font-semibold tracking-tight">Desempenho das contas conectadas</h2>
          <p className="mb-3 text-[13px] text-muted-foreground">{accountAnalyticsDisclaimer()}</p>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatCard label="Visualizações da conta" value={formatMetricOrEmpty(accountViews, accountViews != null ? formatNumber(accountViews) : "—")} />
            <StatCard label="Curtidas" value={formatMetricOrEmpty(likes, likes != null ? formatNumber(likes) : "—")} />
            <StatCard label="Comentários" value={formatMetricOrEmpty(comments, comments != null ? formatNumber(comments) : "—")} />
            <StatCard label="Compartilhamentos" value={formatMetricOrEmpty(shares, shares != null ? formatNumber(shares) : "—")} />
          </div>
          <div className="mt-4 rounded-lg border bg-card p-3">
            <p className="mb-2 text-[13px] font-medium">Visualizações da conta</p>
            {series.length === 0 ? (
              <EmptyState title="Sem dados ainda" description="As métricas da conta aparecem depois que o provedor sincronizar resultados reais." />
            ) : (
              <LineMetricChart data={series} />
            )}
          </div>
        </section>
      ) : null}
    </div>
  );
}
