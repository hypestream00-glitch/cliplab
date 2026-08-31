import { requireWorkspaceContext } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { PageHeader, EmptyState } from "@/components/dashboard/primitives";
import { DataBadge } from "@/components/ui/data-badge";
import { formatNumber, formatDateTime } from "@/lib/utils/format";
import { mediaUrl } from "@/lib/storage/url";
import type { PageSearchProps } from "@/types/routes";
import Link from "next/link";
import { visiblePublicationWhere } from "@/lib/data/visibility";

export const metadata = { title: "Conteúdo" };

export default async function ContentMetricsPage({ searchParams }: PageSearchProps) {
  const { workspace } = await requireWorkspaceContext();
  const params = await searchParams;
  const platform = typeof params.platform === "string" ? params.platform : "";
  const posts = await prisma.socialPublication.findMany({
    where: {
      ...visiblePublicationWhere(workspace.id),
      status: { in: ["PUBLISHED", "PROCESSING", "UPLOADING", "QUEUED", "SCHEDULED", "FAILED"] },
      targets: platform ? { some: { platform: platform as never } } : undefined,
    },
    include: {
      targets: { include: { socialAccount: true, postMetrics: { orderBy: { capturedAt: "desc" }, take: 1 } } },
      clip: true,
    },
    orderBy: { publishedAt: "desc" },
    take: 50,
  });

  return (
    <div>
      <PageHeader title="Conteúdo" description="Métricas por publicação CLIPLAB. Snapshots persistidos — CLIPLAB não consulta X, YouTube ou outras APIs a cada carregamento." />
      <form className="mb-3 flex flex-wrap gap-2">
        <select name="platform" defaultValue={platform} className="h-8 rounded-md border bg-transparent px-2 text-[13px]">
          <option value="">Todas as redes</option>
          {["TIKTOK", "INSTAGRAM", "FACEBOOK", "X", "YOUTUBE", "LINKEDIN", "THREADS", "PINTEREST", "BLUESKY", "REDDIT"].map((item) => (
            <option key={item}>{item}</option>
          ))}
        </select>
        <button className="h-8 rounded-md border px-3 text-[13px]">Aplicar</button>
        <Link href="/studio/metrics/accounts" className="h-8 content-center text-[12px] text-muted-foreground">
          Contas
        </Link>
      </form>
      {posts.length === 0 ? (
        <EmptyState
          title="Nenhuma publicação ainda."
          description="Quando você publicar seu primeiro clip, os resultados aparecerão aqui."
          actionLabel="Publicar"
          actionHref="/studio/publishing"
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[900px] text-left text-[13px]">
          <thead className="border-b bg-muted/30 text-[11px] text-muted-foreground uppercase">
            <tr>
              {["Conteúdo", "Conta", "Rede", "Publicado em", "Status", "Views", "Likes", "Comments", "Shares", "Engagement"].map((col) => (
                <th key={col} className="px-3 py-2 font-medium">
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {posts.map((post) => {
              const target = post.targets[0];
              const snap = target?.postMetrics[0];
              const payload = snap?.rawPayload as { available?: boolean | Record<string, boolean> } | null;
              const flags = typeof payload?.available === "object" ? payload.available : undefined;
              const allOff = payload?.available === false;
              const views = allOff || flags?.views === false ? null : (snap?.views ?? target?.views);
              const likes = allOff || flags?.likes === false ? null : (snap?.likes ?? target?.likes);
              const comments = allOff || flags?.comments === false ? null : (snap?.comments ?? target?.comments);
              const shares = allOff || flags?.shares === false ? null : (snap?.shares ?? target?.shares);
              const engagement = views ? ((likes ?? 0) + (comments ?? 0) + (shares ?? 0)) / views * 100 : null;
              const thumb = mediaUrl(post.clip?.thumbnailKey);
              return (
                <tr key={post.id} className="border-b last:border-0">
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      {thumb ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={thumb} alt="" className="h-10 w-7 rounded object-cover" />
                      ) : (
                        <div className="h-10 w-7 rounded bg-zinc-800" />
                      )}
                      <span className="line-clamp-1">
                        {post.clip?.title ?? post.caption ?? "Post"}
                        {post.mock ? <DataBadge kind="DEMO" className="ml-2 align-middle" /> : null}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-2">@{target?.socialAccount.username ?? "—"}</td>
                  <td className="px-3 py-2">{target?.platform ?? "—"}</td>
                  <td className="px-3 py-2">{post.publishedAt ? formatDateTime(post.publishedAt) : "—"}</td>
                  <td className="px-3 py-2">{post.status}</td>
                  <td className="px-3 py-2">{views == null ? "N/A" : formatNumber(views)}</td>
                  <td className="px-3 py-2">{likes == null ? "N/A" : formatNumber(likes)}</td>
                  <td className="px-3 py-2">{comments == null ? "N/A" : formatNumber(comments)}</td>
                  <td className="px-3 py-2">{shares == null ? "N/A" : formatNumber(shares)}</td>
                  <td className="px-3 py-2">{engagement == null ? "N/A" : `${engagement.toFixed(1)}%`}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      )}
    </div>
  );
}
