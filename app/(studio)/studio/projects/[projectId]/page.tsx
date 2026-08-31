import { notFound } from "next/navigation";
import { requireWorkspaceContext } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { StatusBadge } from "@/components/dashboard/primitives";
import { ClipCard } from "@/components/clips/clip-card";
import { ProcessingPipeline } from "@/components/projects/processing-pipeline";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatDate, formatDuration } from "@/lib/utils/format";
import { retryProjectAction } from "@/app/(studio)/studio/projects/actions";
import { mediaUrl } from "@/lib/storage/url";
import { Button } from "@/components/ui/button";
import { ProjectActionsMenu, RenameProjectControl } from "@/components/projects/project-actions-menu";
import { friendlyError } from "@/lib/ui/friendly-error";
import type { PageParamsProps, PageSearchProps } from "@/types/routes";
import { visibleProjectWhere } from "@/lib/data/visibility";

export default async function ProjectPage({ params }: PageParamsProps<{ projectId: string }> & PageSearchProps) {
  const { workspace } = await requireWorkspaceContext();
  const { projectId } = await params;
  const project = await prisma.project.findFirst({
    where: { id: projectId, ...visibleProjectWhere(workspace.id) },
    include: {
      sourceVideo: true,
      transcript: { include: { segments: { orderBy: { startMs: "asc" } } } },
      clips: { include: { score: true }, orderBy: { startMs: "asc" } },
      jobs: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });
  if (!project) notFound();
  const job = project.jobs[0];
  const processing = !["READY", "FAILED", "CANCELED"].includes(project.status);
  const thumb = mediaUrl(project.sourceVideo?.thumbnailKey);

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-start gap-4">
        {thumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumb} alt="" className="h-20 w-14 rounded-xl object-cover" />
        ) : (
          <div className="h-20 w-14 rounded-xl bg-muted" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-[20px] font-semibold tracking-tight">{project.name}</h1>
            <StatusBadge status={project.archivedAt ? "ARCHIVED" : project.status} />
          </div>
          <p className="mt-1 text-[13px] text-muted-foreground">
            {formatDate(project.createdAt)}
            {project.sourceVideo?.durationMs ? ` · ${formatDuration(project.sourceVideo.durationMs)}` : ""}
            {project.sourceVideo?.width && project.sourceVideo?.height
              ? ` · ${project.sourceVideo.width}×${project.sourceVideo.height}`
              : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <RenameProjectControl projectId={project.id} name={project.name} />
          <ProjectActionsMenu projectId={project.id} name={project.name} archived={Boolean(project.archivedAt)} />
        </div>
      </div>

      {processing ? (
        <div className="mb-5">
          <ProcessingPipeline
            progress={job?.progress ?? 8}
            message={job?.message}
            status={project.status}
            thumbnailKey={project.sourceVideo?.thumbnailKey}
          />
        </div>
      ) : null}
      {project.status === "FAILED" ? (
        <div className="mb-5 rounded-2xl border border-destructive/40 bg-card p-4 text-[13px]">
          <p>{friendlyError(project.errorMessage, "Não conseguimos processar seu vídeo.")}</p>
          <form action={retryProjectAction}>
            <input type="hidden" name="projectId" value={project.id} />
            <Button className="mt-3" size="sm" type="submit">
              Tentar novamente
            </Button>
          </form>
        </div>
      ) : null}

      <Tabs defaultValue="clips">
        <TabsList>
          <TabsTrigger value="clips">Clips</TabsTrigger>
          <TabsTrigger value="transcript">Transcrição</TabsTrigger>
          <TabsTrigger value="details">Detalhes</TabsTrigger>
        </TabsList>
        <TabsContent value="clips" className="mt-4">
          {project.clips.length === 0 ? (
            <p className="rounded-2xl border border-dashed px-3 py-12 text-center text-[13px] text-muted-foreground">
              {processing ? "Os clips aparecem quando o processamento terminar." : "Nenhum clip gerado neste projeto."}
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {project.clips.map((clip) => (
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
                />
              ))}
            </div>
          )}
        </TabsContent>
        <TabsContent value="transcript" className="mt-4">
          <div className="max-h-[520px] space-y-2 overflow-auto rounded-2xl border bg-card p-4">
            {project.transcript?.segments.length ? (
              project.transcript.segments.map((segment) => (
                <p key={segment.id} className="text-[13px] leading-6">
                  <span className="mr-2 text-muted-foreground">{formatDuration(segment.startMs)}</span>
                  {segment.text}
                </p>
              ))
            ) : (
              <p className="text-[13px] text-muted-foreground">
                {processing ? "A transcrição aparece em seguida." : "Ainda não há transcrição neste projeto."}
              </p>
            )}
          </div>
        </TabsContent>
        <TabsContent value="details" className="mt-4 text-[13px]">
          <dl className="grid grid-cols-2 gap-3 rounded-2xl border bg-card p-4">
            <div>
              <dt className="text-muted-foreground">Estilo</dt>
              <dd>{project.mode}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Idioma</dt>
              <dd>{project.language}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Quantidade pedida</dt>
              <dd>{project.clipCount}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Arquivo original</dt>
              <dd className="truncate">{project.sourceVideo?.originalName ?? "—"}</dd>
            </div>
          </dl>
        </TabsContent>
      </Tabs>
    </div>
  );
}
