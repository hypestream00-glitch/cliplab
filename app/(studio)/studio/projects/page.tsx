import Link from "next/link";
import { requireWorkspaceContext } from "@/lib/auth/session";
import { PageHeader, StatusBadge, EmptyState } from "@/components/dashboard/primitives";
import { Button } from "@/components/ui/button";
import { DebouncedSearch } from "@/components/ui/debounced-search";
import { PaginationBar, pageFromSearch } from "@/components/ui/pagination-bar";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { formatDuration, fromNow } from "@/lib/utils/format";
import { listProjects } from "@/lib/services/projects-crud";
import { archiveProjectAction, deleteProjectAction, restoreProjectAction } from "@/app/(studio)/studio/projects/actions";
import type { PageSearchProps } from "@/types/routes";
import { statusLabel } from "@/lib/ui/status-labels";

export const metadata = { title: "Projetos" };

export default async function ProjectsPage({ searchParams }: PageSearchProps) {
  const { workspace } = await requireWorkspaceContext();
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q : "";
  const status = typeof params.status === "string" ? params.status : "";
  const archived = params.filter === "archived";
  const page = pageFromSearch(params.page);
  const { items: projects, pageCount } = await listProjects({
    workspaceId: workspace.id,
    q,
    status: status && status !== "ARCHIVED" ? status : undefined,
    archived,
    page,
  });
  const hrefFor = (next: number) => {
    const search = new URLSearchParams();
    if (q) search.set("q", q);
    if (status) search.set("status", status);
    if (archived) search.set("filter", "archived");
    search.set("page", String(next));
    return `/studio/projects?${search.toString()}`;
  };

  return (
    <div>
      <PageHeader
        title="Projetos"
        description="Todos os vídeos importados neste workspace."
        actions={
          <Button asChild>
            <Link href="/studio/create">Novo projeto</Link>
          </Button>
        }
      />
      <form className="mb-5 flex flex-wrap gap-2">
        <DebouncedSearch key={q} placeholder="Buscar projetos" defaultValue={q} />
        <select name="status" defaultValue={status} className="h-10 rounded-xl border border-border bg-surface px-3 text-[13px] text-white">
          <option value="">Todos os status</option>
          {["CREATED", "UPLOADING", "QUEUED", "PROCESSING", "TRANSCRIBING", "ANALYZING", "GENERATING", "READY", "FAILED", "CANCELED"].map(
            (item) => (
              <option key={item} value={item}>
                {statusLabel(item)}
              </option>
            ),
          )}
        </select>
        <select name="filter" defaultValue={archived ? "archived" : ""} className="h-10 rounded-xl border border-border bg-surface px-3 text-[13px] text-white">
          <option value="">Ativos</option>
          <option value="archived">Arquivados</option>
        </select>
        <button className="h-10 rounded-xl border border-border px-4 text-[13px] font-medium text-white hover:bg-surface-hover" type="submit">
          Filtrar
        </button>
      </form>
      {projects.length === 0 ? (
        <EmptyState
          title={archived ? "Nenhum projeto arquivado." : "Seu próximo vídeo pode virar vários clips."}
          description="Envie um arquivo e a IA encontra os melhores momentos."
          actionLabel="Novo projeto"
          actionHref="/studio/create"
        />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border">
          <table className="w-full min-w-[720px] text-left text-[14px]">
            <thead className="border-b bg-muted/40 text-[11px] tracking-wide text-muted-foreground uppercase">
              <tr>
                <th className="px-5 py-3.5 font-medium">Projeto</th>
                <th className="px-4 py-3.5 font-medium">Status</th>
                <th className="px-4 py-3.5 font-medium">Clipes</th>
                <th className="px-4 py-3.5 font-medium">Duração</th>
                <th className="px-4 py-3.5 font-medium">Atualizado</th>
                <th className="px-4 py-3.5 font-medium">Ações</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((project) => (
                <tr key={project.id} className="border-b last:border-0 hover:bg-surface-hover">
                  <td className="px-5 py-3.5">
                    <Link href={`/studio/projects/${project.id}`} className="flex items-center gap-2 font-medium hover:underline">
                      {project.sourceVideo?.thumbnailKey ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={`/api/media?key=${encodeURIComponent(project.sourceVideo.thumbnailKey)}`} alt="" className="size-8 rounded object-cover" />
                      ) : (
                        <span className="size-8 rounded bg-zinc-900" />
                      )}
                      {project.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3.5">
                    <StatusBadge status={project.archivedAt ? "ARCHIVED" : project.status} />
                  </td>
                  <td className="px-4 py-3.5">{project._count.clips}</td>
                  <td className="px-4 py-3.5 text-text-secondary">
                    {project.sourceVideo?.durationMs ? formatDuration(project.sourceVideo.durationMs) : "—"}
                  </td>
                  <td className="px-4 py-3.5 text-text-secondary">{fromNow(project.updatedAt)}</td>
                  <td className="px-4 py-3.5">
                    <div className="flex flex-wrap gap-1">
                      {project.archivedAt ? (
                        <form action={restoreProjectAction}>
                          <input type="hidden" name="projectId" value={project.id} />
                          <Button size="xs" variant="outline" type="submit">
                            Restaurar
                          </Button>
                        </form>
                      ) : (
                        <ConfirmSubmit
                          action={archiveProjectAction}
                          name="projectId"
                          value={project.id}
                          label="Arquivar"
                          size="xs"
                          variant="outline"
                        />
                      )}
                      <ConfirmSubmit
                        action={deleteProjectAction}
                        name="projectId"
                        value={project.id}
                        extra={{ confirmName: project.name }}
                        label="Excluir"
                        destructive
                        size="xs"
                        message="Exclui o projeto e os clipes."
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <PaginationBar page={page} pageCount={pageCount} hrefFor={hrefFor} />
    </div>
  );
}
