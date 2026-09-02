import Link from "next/link";
import { requireWorkspaceContext } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { DataBadge } from "@/components/ui/data-badge";
import { daysAgo, formatNumber } from "@/lib/utils/format";
import { metricOrNA } from "@/lib/social/metric-display";
import { PageHeader } from "@/components/dashboard/primitives";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import type { PageSearchProps } from "@/types/routes";
import { visibleSocialAccountWhere } from "@/lib/data/visibility";

export const metadata = { title: "Métricas de contas" };

export default async function MetricsAccountsPage({ searchParams }: PageSearchProps) {
  const { workspace } = await requireWorkspaceContext();
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q : "";
  const platform = typeof params.platform === "string" ? params.platform : "";
  const accountId = typeof params.account === "string" ? params.account : "";
  const range = typeof params.range === "string" ? params.range : "30";
  const sort = typeof params.sort === "string" ? params.sort : "views";

  const days = Number(range) || 30;
  const since = daysAgo(days);

  const accounts = await prisma.socialAccount.findMany({
    where: {
      ...visibleSocialAccountWhere(workspace.id),
      id: accountId || undefined,
      platform: platform ? (platform as never) : undefined,
      OR: q
        ? [{ username: { contains: q, mode: "insensitive" } }, { displayName: { contains: q, mode: "insensitive" } }]
        : undefined,
    },
    include: {
      metricSnaps: { where: { capturedAt: { gte: since } }, orderBy: { capturedAt: "desc" }, take: 8 },
    },
  });
  const accountOptions = await prisma.socialAccount.findMany({
    where: visibleSocialAccountWhere(workspace.id),
    select: { id: true, platform: true, username: true },
    orderBy: [{ platform: "asc" }, { username: "asc" }],
  });

  const rows = accounts.map((account) => {
    const latest = account.metricSnaps[0];
    const prev = account.metricSnaps[7] ?? account.metricSnaps.at(-1);
    const views = latest?.views ?? 0;
    const delta = prev ? views - prev.views : 0;
    return {
      account,
      latest,
      delta,
    };
  });

  rows.sort((a, b) => {
    const av = a.latest?.[sort as "views" | "likes" | "followers"] ?? a.latest?.views ?? 0;
    const bv = b.latest?.[sort as "views" | "likes" | "followers"] ?? b.latest?.views ?? 0;
    return Number(bv) - Number(av);
  });

  return (
    <div>
      <PageHeader title="Contas" description="Performance por conta conectada, com variação no período." />
        <div className="mb-3 flex flex-wrap items-center gap-2 text-[12px]">
        <Link href="/studio/metrics" className="text-muted-foreground hover:text-foreground">
          Visão geral
        </Link>
        <span className="text-muted-foreground">/</span>
        <span className="font-medium">Contas</span>
        <Link href="/studio/metrics/content" className="text-muted-foreground hover:text-foreground">
          / Conteúdo
        </Link>
        <span className="mx-2 h-4 w-px bg-border" />
        {["7", "30", "90"].map((value) => (
          <Link
            key={value}
            href={`/studio/metrics/accounts?range=${value}${q ? `&q=${encodeURIComponent(q)}` : ""}${platform ? `&platform=${platform}` : ""}${accountId ? `&account=${accountId}` : ""}`}
            className={range === value ? "font-medium" : "text-muted-foreground"}
          >
            {value}d
          </Link>
        ))}
      </div>
      <form className="mb-3 flex flex-wrap gap-2">
        <input type="hidden" name="range" value={range} />
        <input name="q" defaultValue={q} placeholder="Buscar @username" className="h-8 w-56 rounded-md border bg-transparent px-2 text-[13px]" />
        <select name="platform" defaultValue={platform} className="h-8 rounded-md border bg-transparent px-2 text-[13px]">
          <option value="">Todas as redes</option>
          {["TIKTOK", "INSTAGRAM", "FACEBOOK", "YOUTUBE", "X", "TWITCH", "KICK", "BILIBILI", "LINKEDIN", "THREADS", "PINTEREST", "REDDIT"].map((item) => (
            <option key={item}>{item}</option>
          ))}
        </select>
        <select name="account" defaultValue={accountId} className="h-8 rounded-md border bg-transparent px-2 text-[13px]">
          <option value="">Todas as contas</option>
          {accountOptions.map((account) => (
            <option key={account.id} value={account.id}>
              {account.platform} · @{account.username}
            </option>
          ))}
        </select>
        <select name="sort" defaultValue={sort} className="h-8 rounded-md border bg-transparent px-2 text-[13px]">
          <option value="views">Visualizações</option>
          <option value="followers">Seguidores</option>
          <option value="likes">Curtidas</option>
        </select>
        <button className="h-8 rounded-md border px-3 text-[13px]">Aplicar</button>
      </form>
      <div className="overflow-hidden rounded-xl border">
        <table className="w-full min-w-[980px] text-left text-[13px]">
          <thead className="sticky top-0 border-b bg-card text-[11px] tracking-wide text-muted-foreground uppercase">
            <tr>
              {["Conta", "Plataforma", "Seguidores", "Visualizações", "Curtidas", "Comentários", "Compartilhamentos", "Posts", "Engagement", "Variação"].map((col) => (
                <th key={col} className="px-3 py-2 font-medium">
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ account, latest, delta }) => {
              const available = (latest?.rawPayload as { available?: Record<string, boolean> } | null)?.available;
              return (
              <tr key={account.id} className="border-b last:border-0 hover:bg-muted/25">
                <td className="px-3 py-2.5">
                  <Link href={`/studio/metrics/accounts/${account.id}`} className="flex items-center gap-2">
                    <Avatar className="size-7">
                      <AvatarFallback className="text-[10px]">{account.username.slice(0, 2).toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <span>
                      <span className="flex items-center gap-1.5 font-medium">
                        {account.displayName}
                        {account.mock ? <DataBadge kind="DEMO" /> : null}
                      </span>
                      <span className="text-[12px] text-muted-foreground">@{account.username}</span>
                    </span>
                  </Link>
                </td>
                <td className="px-3 py-2">{account.platform}</td>
                <td className="px-3 py-2">{metricOrNA(latest?.followers, available?.followers, formatNumber(latest?.followers ?? 0))}</td>
                <td className="px-3 py-2">{metricOrNA(latest?.views, available?.views, formatNumber(latest?.views ?? 0))}</td>
                <td className="px-3 py-2">{metricOrNA(latest?.likes, available?.likes, formatNumber(latest?.likes ?? 0))}</td>
                <td className="px-3 py-2">{metricOrNA(latest?.comments, available?.comments, formatNumber(latest?.comments ?? 0))}</td>
                <td className="px-3 py-2">{metricOrNA(latest?.shares, available?.shares, formatNumber(latest?.shares ?? 0))}</td>
                <td className="px-3 py-2">{metricOrNA(latest?.posts, available?.posts, formatNumber(latest?.posts ?? 0))}</td>
                <td className="px-3 py-2">{available && !available.views ? "N/A" : `${(latest?.engagement ?? 0).toFixed(1)}%`}</td>
                <td className={`px-3 py-2 ${delta >= 0 ? "text-emerald-300" : "text-red-300"}`}>
                  {available?.views === false ? "N/A" : `${delta >= 0 ? "+" : ""}${formatNumber(delta)}`}
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
