import Link from "next/link";
import { requireWorkspaceContext } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { EmptyState, PageHeader, StatusBadge } from "@/components/dashboard/primitives";
import { DebouncedSearch } from "@/components/ui/debounced-search";
import { PaginationBar, pageFromSearch } from "@/components/ui/pagination-bar";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { Button } from "@/components/ui/button";
import { fromNow } from "@/lib/utils/format";
import { mediaUrl } from "@/lib/storage/url";
import { deleteLibraryAssetAction } from "@/app/(studio)/studio/library/actions";
import type { PageSearchProps } from "@/types/routes";
import { visibleClipLibraryWhere, visibleProjectWhere } from "@/lib/data/visibility";

export const metadata = { title: "Biblioteca" };

const PAGE_SIZE = 24;

export default async function LibraryPage({ searchParams }: PageSearchProps) {
  const { workspace } = await requireWorkspaceContext();
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q : "";
  const kind = typeof params.kind === "string" ? params.kind : "all";
  const page = pageFromSearch(params.page);

  const [uploads, clips, renders] = await Promise.all([
    kind === "all" || kind === "uploads"
      ? prisma.sourceVideo.findMany({
          where: {
            project: { ...visibleProjectWhere(workspace.id), archivedAt: null },
            originalName: q ? { contains: q, mode: "insensitive" } : undefined,
          },
          include: { project: true },
          orderBy: { createdAt: "desc" },
          take: 80,
        })
      : Promise.resolve([]),
    kind === "all" || kind === "clips"
      ? prisma.clip.findMany({
          where: {
            ...visibleClipLibraryWhere(workspace.id),
            title: q ? { contains: q, mode: "insensitive" } : undefined,
          },
          orderBy: { createdAt: "desc" },
          take: 80,
        })
      : Promise.resolve([]),
    kind === "all" || kind === "renders"
      ? prisma.renderedAsset.findMany({
          where: {
            clip: {
              ...visibleClipLibraryWhere(workspace.id),
              title: q ? { contains: q, mode: "insensitive" } : undefined,
            },
          },
          include: { clip: true, renderJob: true },
          orderBy: { createdAt: "desc" },
          take: 80,
        })
      : Promise.resolve([]),
  ]);

  type Row = {
    id: string;
    kind: "upload" | "clip" | "render";
    title: string;
    href: string;
    thumb?: string | null;
    downloadKey?: string | null;
    createdAt: Date;
    status?: string;
  };

  const rows: Row[] = [
    ...uploads.map((item) => ({
      id: item.id,
      kind: "upload" as const,
      title: item.originalName ?? item.project.name,
      href: `/studio/projects/${item.projectId}`,
      thumb: item.thumbnailKey,
      downloadKey: item.storageKey,
      createdAt: item.createdAt,
      status: item.project.status,
    })),
    ...clips.map((item) => ({
      id: item.id,
      kind: "clip" as const,
      title: item.title,
      href: `/studio/clips/${item.id}`,
      thumb: item.thumbnailKey,
      downloadKey: item.storageKey,
      createdAt: item.createdAt,
      status: item.status,
    })),
    ...renders.map((item) => ({
      id: item.id,
      kind: "render" as const,
      title: `${item.clip.title} (${item.renderJob.resolution})`,
      href: `/studio/clips/${item.clipId}`,
      thumb: item.clip.thumbnailKey,
      downloadKey: item.storageKey,
      createdAt: item.createdAt,
      status: item.renderJob.status,
    })),
  ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const slice = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const hrefFor = (next: number) => {
    const search = new URLSearchParams();
    if (q) search.set("q", q);
    if (kind !== "all") search.set("kind", kind);
    search.set("page", String(next));
    return `/studio/library?${search.toString()}`;
  };

  return (
    <div>
      <PageHeader title="Biblioteca" description="Uploads, clipes e renders persistidos neste workspace." />
      <form className="mb-3 flex flex-wrap items-center gap-2">
        <DebouncedSearch key={q} placeholder="Buscar assets" defaultValue={q} />
        <select name="kind" defaultValue={kind} className="h-8 rounded-md border bg-transparent px-2 text-[13px]">
          <option value="all">Todos</option>
          <option value="uploads">Uploads</option>
          <option value="clips">Clipes</option>
          <option value="renders">Renders</option>
        </select>
        <button className="h-8 rounded-md border px-3 text-[13px]" type="submit">
          Filtrar
        </button>
      </form>
      {slice.length === 0 ? (
        <EmptyState
          title="Nenhum asset ainda."
          description="Faça upload de um vídeo para popular a biblioteca."
          actionLabel="Novo projeto"
          actionHref="/studio/create"
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[720px] text-left text-[13px]">
            <thead className="border-b bg-muted/30 text-[11px] tracking-wide text-muted-foreground uppercase">
              <tr>
                {["Asset", "Tipo", "Status", "Atualizado", "Ações"].map((col) => (
                  <th key={col} className="px-3 py-2 font-medium">
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {slice.map((row) => {
                const thumb = mediaUrl(row.thumb);
                return (
                  <tr key={`${row.kind}-${row.id}`} className="border-b last:border-0">
                    <td className="px-3 py-2">
                      <Link href={row.href} className="flex items-center gap-2 hover:underline">
                        {thumb ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={thumb} alt="" className="size-8 rounded object-cover" />
                        ) : (
                          <span className="size-8 rounded bg-zinc-900" />
                        )}
                        {row.title}
                      </Link>
                    </td>
                    <td className="px-3 py-2 capitalize">{row.kind}</td>
                    <td className="px-3 py-2">{row.status ? <StatusBadge status={row.status} /> : "—"}</td>
                    <td className="px-3 py-2 text-muted-foreground">{fromNow(row.createdAt)}</td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap items-center gap-2">
                        {row.downloadKey ? (
                          <Button asChild size="xs" variant="outline">
                            <a href={`/api/media?key=${encodeURIComponent(row.downloadKey)}&download=1`}>Download</a>
                          </Button>
                        ) : null}
                        <ConfirmSubmit
                          action={deleteLibraryAssetAction}
                          name="id"
                          value={row.id}
                          extra={{ kind: row.kind }}
                          label="Excluir"
                          destructive
                          size="xs"
                          message={row.kind === "upload" ? "Exclui o projeto inteiro." : undefined}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <PaginationBar page={page} pageCount={pageCount} hrefFor={hrefFor} />
    </div>
  );
}
