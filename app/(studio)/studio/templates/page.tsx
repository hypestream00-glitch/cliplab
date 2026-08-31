import { requireWorkspaceContext } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { EmptyState, PageHeader } from "@/components/dashboard/primitives";
import { applyTemplateAction } from "@/app/(studio)/studio/templates/actions";
import { Button } from "@/components/ui/button";
import { DevNotice } from "@/components/dashboard/dev-notice";
import type { PageSearchProps } from "@/types/routes";
import { visibleClipLibraryWhere } from "@/lib/data/visibility";

export const metadata = { title: "Templates" };

export default async function TemplatesPage({ searchParams }: PageSearchProps) {
  const { workspace } = await requireWorkspaceContext();
  const params = await searchParams;
  const error = typeof params.error === "string" ? params.error : "";
  const [templates, clips] = await Promise.all([
    prisma.template.findMany({ where: { workspaceId: workspace.id } }),
    prisma.clip.findMany({
      where: { ...visibleClipLibraryWhere(workspace.id), status: { not: "ARCHIVED" } },
      orderBy: { createdAt: "desc" },
      take: 40,
    }),
  ]);
  return (
    <div>
      <PageHeader title="Templates" description="Aplique um canvas a um clipe. O editor abre já com o template." />
      {error === "clips" ? <p className="mb-3 text-[12px] text-destructive">Selecione um clipe para aplicar.</p> : null}
      {templates.length === 0 ? (
        <EmptyState title="Nenhum template neste workspace." description="Os templates aparecem aqui quando você criar um." />
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {templates.map((template) => (
            <article key={template.id} className="rounded-lg border p-3">
              <div className="mb-2 aspect-[9/16] rounded bg-zinc-900" />
              <p className="text-[13px] font-medium">{template.name}</p>
              <form action={applyTemplateAction} className="mt-2 space-y-2">
                <input type="hidden" name="templateId" value={template.id} />
                <select name="clipIds" required className="h-8 w-full rounded-md border bg-transparent px-2 text-[12px]">
                  <option value="">Escolher clipe</option>
                  {clips.map((clip) => (
                    <option key={clip.id} value={clip.id}>
                      {clip.title}
                    </option>
                  ))}
                </select>
                <Button size="sm" type="submit" className="w-full" disabled={clips.length === 0}>
                  Aplicar e abrir editor
                </Button>
              </form>
            </article>
          ))}
        </div>
      )}
      {clips.length === 0 ? (
        <div className="mt-4">
          <DevNotice>Gere clipes em um projeto para aplicar templates.</DevNotice>
        </div>
      ) : null}
    </div>
  );
}
