import { notFound } from "next/navigation";
import { requireWorkspaceContext } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { ClipCard } from "@/components/clips/clip-card";
import { EmptyState, PageHeader } from "@/components/dashboard/primitives";
import { bulkDownloadAction } from "@/app/(studio)/studio/clips/actions";
import { BulkDownloadBar } from "@/components/clips/bulk-download";
import type { PageParamsProps } from "@/types/routes";
import { visibleProjectWhere } from "@/lib/data/visibility";

export default async function ProjectClipsPage({ params }: PageParamsProps<{ projectId: string }>) {
  const { workspace } = await requireWorkspaceContext();
  const { projectId } = await params;
  const project = await prisma.project.findFirst({
    where: { id: projectId, ...visibleProjectWhere(workspace.id) },
    include: { clips: { include: { score: true } } },
  });
  if (!project) notFound();
  return (
    <div>
      <PageHeader title={`Clipes · ${project.name}`} />
      {project.clips.length === 0 ? (
        <EmptyState
          title="Nenhum clipe neste projeto."
          description="Quando o processamento terminar, os clipes aparecem aqui."
          actionLabel="Voltar ao projeto"
          actionHref={`/studio/projects/${project.id}`}
        />
      ) : (
        <form action={bulkDownloadAction}>
          <BulkDownloadBar />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {project.clips.map((clip) => (
              <ClipCard
                key={clip.id}
                id={clip.id}
                title={clip.title}
                durationMs={clip.durationMs}
                score={clip.score?.overall}
                status={clip.status}
                thumbnailKey={clip.thumbnailKey}
                selectable
              />
            ))}
          </div>
        </form>
      )}
    </div>
  );
}
