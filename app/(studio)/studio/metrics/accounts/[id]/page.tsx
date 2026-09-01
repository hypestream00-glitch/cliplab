import { notFound } from "next/navigation";
import { requireWorkspaceContext } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { LineMetricChart } from "@/components/charts/metric-charts";
import { StatCard } from "@/components/dashboard/primitives";
import { formatNumber } from "@/lib/utils/format";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { DataBadge } from "@/components/ui/data-badge";
import type { PageParamsProps } from "@/types/routes";
import { visibleSocialAccountWhere } from "@/lib/data/visibility";
import { realSnapshotMetric, formatMetricOrEmpty } from "@/lib/data/metrics-display";

export default async function AccountMetricsPage({ params }: PageParamsProps<{ id: string }>) {
  const { workspace } = await requireWorkspaceContext();
  const { id } = await params;
  const account = await prisma.socialAccount.findFirst({
    where: { id, ...visibleSocialAccountWhere(workspace.id) },
    include: {
      metricSnaps: { orderBy: { capturedAt: "asc" } },
      postMetrics: { orderBy: { capturedAt: "desc" }, take: 8 },
    },
  });
  if (!account) notFound();
  const latest = account.metricSnaps.at(-1);
  const viewsValue = realSnapshotMetric(latest, "views");
  const likesValue = realSnapshotMetric(latest, "likes");
  const commentsValue = realSnapshotMetric(latest, "comments");
  const sharesValue = realSnapshotMetric(latest, "shares");
  const followersValue = realSnapshotMetric(latest, "followers");
  const views = account.metricSnaps
    .map((item) => {
      const value = realSnapshotMetric(item, "views");
      return value == null ? null : { label: item.capturedAt.toISOString().slice(5, 10), value };
    })
    .filter((item): item is { label: string; value: number } => Boolean(item));
  const followers = account.metricSnaps
    .map((item) => {
      const value = realSnapshotMetric(item, "followers");
      return value == null ? null : { label: item.capturedAt.toISOString().slice(5, 10), value };
    })
    .filter((item): item is { label: string; value: number } => Boolean(item));
  const demo = account.mock;

  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        <Avatar className="size-12">
          <AvatarFallback>{account.username.slice(0, 2).toUpperCase()}</AvatarFallback>
        </Avatar>
        <div>
          <h1 className="flex items-center gap-2 text-[18px] font-semibold">
            {account.displayName}
            {demo ? <DataBadge kind="DEMO" /> : null}
          </h1>
          <p className="text-[13px] text-muted-foreground">
            @{account.username} · {account.platform}
          </p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
        <StatCard label="Followers" value={formatMetricOrEmpty(followersValue, followersValue != null ? formatNumber(followersValue) : "—")} badge={demo ? <DataBadge kind="DEMO" /> : undefined} />
        <StatCard label="Views" value={formatMetricOrEmpty(viewsValue, viewsValue != null ? formatNumber(viewsValue) : "—")} />
        <StatCard label="Likes" value={formatMetricOrEmpty(likesValue, likesValue != null ? formatNumber(likesValue) : "—")} />
        <StatCard label="Comments" value={formatMetricOrEmpty(commentsValue, commentsValue != null ? formatNumber(commentsValue) : "—")} />
        <StatCard label="Shares" value={formatMetricOrEmpty(sharesValue, sharesValue != null ? formatNumber(sharesValue) : "—")} />
        <StatCard label="Engagement" value={latest && viewsValue != null ? `${latest.engagement.toFixed(1)}%` : "—"} />
      </div>
      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <div className="rounded-lg border p-3">
          <p className="mb-2 text-[13px] font-medium">Crescimento de views</p>
          {views.length === 0 ? (
            <p className="py-8 text-center text-[13px] text-muted-foreground">Nenhum snapshot persistido para esta conta.</p>
          ) : (
            <LineMetricChart data={views} />
          )}
        </div>
        <div className="rounded-lg border p-3">
          <p className="mb-2 text-[13px] font-medium">Crescimento de followers</p>
          {followers.length === 0 ? (
            <p className="py-8 text-center text-[13px] text-muted-foreground">Nenhum snapshot persistido para esta conta.</p>
          ) : (
            <LineMetricChart data={followers} />
          )}
        </div>
      </div>
      {account.postMetrics.length === 0 ? (
        <p className="mt-4 rounded-lg border border-dashed px-3 py-8 text-center text-[13px] text-muted-foreground">
          Sem métricas de conteúdo. CortaClip não inventa melhor horário.
        </p>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-lg border">
          <table className="w-full text-left text-[13px]">
            <thead className="border-b bg-muted/30 text-[11px] uppercase text-muted-foreground">
              <tr>
                {["Capturado", "Views", "Likes", "Comments"].map((col) => (
                  <th key={col} className="px-3 py-2 font-medium">
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {account.postMetrics.map((snap) => (
                <tr key={snap.id} className="border-b last:border-0">
                  <td className="px-3 py-2">{snap.capturedAt.toISOString().slice(0, 10)}</td>
                  <td className="px-3 py-2">{formatNumber(snap.views)}</td>
                  <td className="px-3 py-2">{formatNumber(snap.likes)}</td>
                  <td className="px-3 py-2">{formatNumber(snap.comments)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
