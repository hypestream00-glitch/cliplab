import Link from "next/link";
import { requireWorkspaceContext } from "@/lib/auth/session";
import { PageHeader, EmptyState } from "@/components/dashboard/primitives";
import { listTrendingItems } from "@/lib/trending/query";
import { TRENDING_CATEGORIES, TRENDING_PLATFORMS } from "@/lib/competitions/platforms";
import { formatNumber, formatDate, formatDuration } from "@/lib/utils/format";
import type { PageSearchProps } from "@/types/routes";

export const metadata = { title: "Em alta" };

export default async function TrendingPage({ searchParams }: PageSearchProps) {
  await requireWorkspaceContext();
  const params = await searchParams;
  const platform = typeof params.platform === "string" ? params.platform : "ALL";
  const category = typeof params.category === "string" ? params.category : "ALL";
  const sort = typeof params.sort === "string" ? params.sort : "hot";
  const items = await listTrendingItems({ platform, category, sort });
  const href = (next: Record<string, string>) => {
    const search = new URLSearchParams({ platform, category, sort, ...next });
    return `/studio/trending?${search.toString()}`;
  };
  return (
    <div>
      <PageHeader title="🔥 Em alta" description="Descubra vídeos e conteúdos com potencial para gerar clips virais." />
      <div className="mb-5 flex flex-wrap gap-2 text-[13px]">
        {["ALL", ...TRENDING_PLATFORMS].map((item) => (
          <Link key={item} href={href({ platform: item })} className={`filter-chip ${platform === item ? "filter-chip-active" : ""}`}>
            {item === "ALL" ? "Todos" : item}
          </Link>
        ))}
      </div>
      <div className="mb-5 flex flex-wrap gap-2 text-[13px]">
        {["ALL", ...TRENDING_CATEGORIES].map((item) => (
          <Link key={item} href={href({ category: item })} className={`filter-chip ${category === item ? "filter-chip-active" : ""}`}>
            {item === "ALL" ? "Categorias" : item}
          </Link>
        ))}
      </div>
      <div className="mb-6 flex flex-wrap gap-2 text-[13px]">
        {[
          ["hot", "Mais quentes"],
          ["views", "Mais vistos"],
          ["fast", "Crescendo mais rápido"],
          ["recent", "Mais recentes"],
        ].map(([id, label]) => (
          <Link key={id} href={href({ sort: id })} className={`filter-chip ${sort === id ? "filter-chip-active" : ""}`}>
            {label}
          </Link>
        ))}
      </div>
      {items.length === 0 ? (
        <EmptyState
          title="Nenhum conteúdo em alta com dados oficiais agora."
          description="O CortaClip só lista itens com fonte autorizada. Plataformas sem API oficial aparecem como indisponíveis."
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {items.map((item) => (
            <article key={item.id} className="overflow-hidden rounded-2xl border border-border bg-card">
              {item.thumbnailUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={item.thumbnailUrl} alt="" className="h-40 w-full object-cover" />
              ) : (
                <div className="h-24 bg-muted" />
              )}
              <div className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <h2 className="text-[14px] font-semibold">{item.title}</h2>
                  <span className="rounded-md border border-primary/40 px-1.5 py-0.5 text-[11px] text-primary">
                    {item.trendScore == null ? "N/A" : `🔥 ${item.trendScore}/100`}
                  </span>
                </div>
                <p className="mt-1 text-[12px] text-muted-foreground">
                  {item.creatorName ?? "Criador indisponível"} · {item.platform} · {item.category}
                </p>
                <p className="mt-1 text-[12px] text-muted-foreground">
                  {item.viewCount != null ? `${formatNumber(item.viewCount)} views` : "Views indisponíveis"}
                  {item.views24h != null ? ` · +${formatNumber(item.views24h)} 24h` : ""}
                  {item.durationSeconds != null ? ` · ${formatDuration(item.durationSeconds * 1000)}` : ""}
                  {item.publishedAt ? ` · ${formatDate(item.publishedAt)}` : ""}
                </p>
                {item.projectId ? (
                  <Link href={`/studio/create?projectId=${item.projectId}`} className="mt-3 inline-flex h-9 items-center rounded-lg gradient-brand px-3 text-[13px] font-medium text-white">
                    ✨ Criar clips
                  </Link>
                ) : (
                  <p className="mt-3 text-[12px] text-muted-foreground">Usar como referência. Importação automática desta fonte ainda não é suportada.</p>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
