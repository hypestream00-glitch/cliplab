import { requireWorkspaceContext } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { ClipCard } from "@/components/clips/clip-card";
import { EmptyState, PageHeader } from "@/components/dashboard/primitives";
import { bulkDownloadAction } from "@/app/(studio)/studio/clips/actions";
import { BulkDownloadBar, BulkDownloadStatus } from "@/components/clips/bulk-download";
import { DebouncedSearch } from "@/components/ui/debounced-search";
import { PaginationBar, pageFromSearch } from "@/components/ui/pagination-bar";
import type { PageSearchProps } from "@/types/routes";
import type { Prisma } from "@/generated/prisma/client";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { visibleClipLibraryWhere } from "@/lib/data/visibility";

export const metadata = { title: "Meus clips" };

export default async function ClipsPage({ searchParams }: PageSearchProps) {
  const { workspace } = await requireWorkspaceContext();
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q : "";
  const sort = typeof params.sort === "string" ? params.sort : "recent";
  const filter = typeof params.filter === "string" ? params.filter : "all";
  const bulkId = typeof params.bulk === "string" ? params.bulk : "";
  const page = pageFromSearch(params.page);
  const pageSize = 24;
  const where: Prisma.ClipWhereInput = {
    AND: [
      visibleClipLibraryWhere(workspace.id),
      {
        title: q ? { contains: q, mode: "insensitive" } : undefined,
        ...(filter === "unpublished" ? { status: { not: "PUBLISHED" } } : {}),
        ...(filter === "published" ? { status: "PUBLISHED" } : {}),
        ...(filter === "scheduled" ? { publications: { some: { status: "SCHEDULED", mock: false } } } : {}),
      },
    ],
  };
  const orderBy: Prisma.ClipOrderByWithRelationInput =
    sort === "score"
      ? { score: { overall: "desc" } }
      : sort === "score-asc"
        ? { score: { overall: "asc" } }
        : { createdAt: sort === "oldest" ? "asc" : "desc" };
  const [clips, total, bulkJob] = await Promise.all([
    prisma.clip.findMany({
      where,
      include: { score: true, project: true },
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.clip.count({ where }),
    bulkId
      ? prisma.processingJob.findFirst({ where: { id: bulkId, workspaceId: workspace.id, type: "BULK_DOWNLOAD" } })
      : Promise.resolve(null),
  ]);
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const hrefFor = (next: number) => {
    const search = new URLSearchParams();
    if (q) search.set("q", q);
    if (sort) search.set("sort", sort);
    if (filter && filter !== "all") search.set("filter", filter);
    search.set("page", String(next));
    return `/studio/clips?${search.toString()}`;
  };
  const filters = [
    { id: "all", label: "Todos" },
    { id: "unpublished", label: "Não publicados" },
    { id: "scheduled", label: "Agendados" },
    { id: "published", label: "Publicados" },
  ];

  return (
    <div>
      <PageHeader title="Meus clips" description="Todos os clips gerados neste workspace." />
      <form className="mb-4 flex flex-wrap gap-2">
        <DebouncedSearch key={q} placeholder="Buscar clips" defaultValue={q} />
        <select name="sort" defaultValue={sort} className="h-10 rounded-xl border border-border bg-surface px-3 text-[13px] text-white">
          <option value="recent">Mais recentes</option>
          <option value="score">Maior score</option>
          <option value="score-asc">Menor score</option>
          <option value="oldest">Mais antigos</option>
        </select>
        <input type="hidden" name="filter" value={filter} />
        <button className="h-10 rounded-xl border border-border px-4 text-[13px] font-medium text-white hover:bg-surface-hover" type="submit">
          Ordenar
        </button>
      </form>
      <div className="mb-5 flex flex-wrap gap-2">
        {filters.map((item) => (
          <Link
            key={item.id}
            href={`/studio/clips?filter=${item.id}${q ? `&q=${encodeURIComponent(q)}` : ""}&sort=${sort}`}
            className={cn("filter-chip", filter === item.id && "filter-chip-active")}
          >
            {item.label}
          </Link>
        ))}
      </div>
      {bulkJob ? (
        <BulkDownloadStatus jobId={bulkJob.id} status={bulkJob.status} message={bulkJob.message} errorMessage={bulkJob.errorMessage} />
      ) : null}
      {clips.length === 0 ? (
        <EmptyState
          title="Seus clips aparecerão aqui depois que processarmos um vídeo."
          description="Envie um vídeo para gerar os melhores momentos."
          actionHref="/studio/create"
          actionLabel="Criar primeiro projeto"
        />
      ) : (
        <form action={bulkDownloadAction}>
          <BulkDownloadBar />
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
            {clips.map((clip) => (
              <ClipCard
                key={clip.id}
                id={clip.id}
                title={clip.title}
                durationMs={clip.durationMs}
                score={clip.score?.overall}
                status={clip.status}
                thumbnailKey={clip.thumbnailKey}
                storageKey={clip.storageKey}
                caption={clip.suggestedCaption}
                hashtags={clip.hashtags}
                selectable
              />
            ))}
          </div>
        </form>
      )}
      <PaginationBar page={page} pageCount={pageCount} hrefFor={hrefFor} />
    </div>
  );
}
