import Link from "next/link";
import { notFound } from "next/navigation";
import { requireWorkspaceContext } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { ScoreBadge } from "@/components/clips/clip-card";
import { StatusBadge } from "@/components/dashboard/primitives";
import { Button } from "@/components/ui/button";
import { formatDuration } from "@/lib/utils/format";
import { ClipPreviewPlayer } from "@/components/media/clip-preview-player";
import { mediaUrl } from "@/lib/storage/url";
import { getProcessingCapabilities } from "@/lib/media/capabilities";
import {
  archiveClipAction,
  deleteClipAction,
  downloadClipAction,
  duplicateClipAction,
  renderClipAction,
} from "@/app/(studio)/studio/clips/actions";
import type { PageParamsProps, PageSearchProps } from "@/types/routes";
import { ClipSuggestionsForm } from "@/components/clips/clip-suggestions";
import { ProcessingPipeline } from "@/components/projects/processing-pipeline";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { friendlyError } from "@/lib/ui/friendly-error";
import { visibleClipWhere } from "@/lib/data/visibility";
import { ViralScorePanel } from "@/components/clips/viral-score-panel";

export default async function ClipPage({
  params,
  searchParams,
}: PageParamsProps<{ clipId: string }> & PageSearchProps) {
  const { workspace } = await requireWorkspaceContext();
  const { clipId } = await params;
  const query = await searchParams;
  const notice = typeof query.notice === "string" ? query.notice : "";
  const [clip, capabilities] = await Promise.all([
    prisma.clip.findFirst({
      where: { id: clipId, ...visibleClipWhere(workspace.id) },
      include: {
        score: true,
        project: true,
        renderedAssets: { orderBy: { createdAt: "desc" }, take: 1 },
        renderJobs: { orderBy: { createdAt: "desc" }, take: 1 },
      },
    }),
    getProcessingCapabilities(),
  ]);
  if (!clip) notFound();
  const job = clip.renderJobs[0];
  const src = mediaUrl(clip.storageKey ?? clip.renderedAssets[0]?.storageKey);
  const poster = mediaUrl(clip.thumbnailKey);
  return (
    <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
      {src ? (
        <ClipPreviewPlayer src={src} poster={poster} />
      ) : (
        <div className="flex aspect-[9/16] items-center justify-center rounded-2xl border bg-zinc-950 p-4 text-center text-[12px] text-muted-foreground">
          {clip.status === "READY"
            ? "O arquivo deste clip ainda não está disponível."
            : "O arquivo do clip ainda está sendo gerado."}
        </div>
      )}
      <div>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-[22px] font-semibold tracking-tight">{clip.title}</h1>
            <p className="mt-1 text-[13px] text-muted-foreground">
              <Link href={`/studio/projects/${clip.projectId}`} className="hover:underline">
                {clip.project.name}
              </Link>{" "}
              · {formatDuration(clip.durationMs)}
            </p>
          </div>
          <StatusBadge status={clip.status} />
        </div>
        {notice === "rendering" || clip.status === "RENDERING" ? (
          <div className="mt-3">
            <ProcessingPipeline progress={job?.progress ?? 10} message="Exportando o vídeo" />
          </div>
        ) : null}
        {notice === "ffmpeg-missing" || notice === "no-file" ? (
          <p className="mt-3 text-[13px] text-destructive">Não foi possível exportar este clip agora. Tente novamente.</p>
        ) : null}
        {job?.status === "DONE" ? (
          <p className="mt-3 text-[12px] text-muted-foreground">Exportação concluída. Use Download para baixar o MP4.</p>
        ) : null}
        {job?.status === "FAILED" ? (
          <p className="mt-3 text-[12px] text-destructive">{friendlyError(job.errorMessage)}</p>
        ) : null}
        {clip.score ? (
          <div className="mt-4">
            <ScoreBadge score={clip.score.overall} />
            <ViralScorePanel score={clip.score} durationMs={clip.durationMs} />
          </div>
        ) : null}
        <ClipSuggestionsForm
          clipId={clip.id}
          title={clip.title}
          summary={clip.summary ?? ""}
          reason={clip.reason ?? ""}
          caption={clip.suggestedCaption ?? clip.description ?? ""}
          hashtags={clip.hashtags}
          canRegenerate={capabilities.analysis === "REAL"}
          mocked={false}
        />
        {clip.summary ? <p className="mt-4 text-[13px] text-muted-foreground">{clip.summary}</p> : null}
        <div className="mt-4 flex flex-wrap gap-2">
          <Button asChild>
            <Link href={`/studio/editor/${clip.id}`}>Editar</Link>
          </Button>
          {clip.status !== "RENDERING" && job?.status !== "RENDERING" ? (
            <form action={renderClipAction}>
              <input type="hidden" name="clipId" value={clip.id} />
              <Button variant="outline" type="submit">
                Exportar
              </Button>
            </form>
          ) : null}
          <Button asChild variant="outline">
            <Link href={`/studio/publishing?clip=${clip.id}`}>Publicar</Link>
          </Button>
          <form action={downloadClipAction}>
            <input type="hidden" name="clipId" value={clip.id} />
            <Button variant="outline" type="submit">
              Download
            </Button>
          </form>
          <form action={duplicateClipAction}>
            <input type="hidden" name="clipId" value={clip.id} />
            <Button variant="ghost" type="submit">
              Duplicar
            </Button>
          </form>
          <form action={archiveClipAction}>
            <input type="hidden" name="clipId" value={clip.id} />
            <Button variant="ghost" type="submit">
              Arquivar
            </Button>
          </form>
          <ConfirmSubmit
            action={deleteClipAction}
            name="clipId"
            value={clip.id}
            label="Excluir"
            destructive
            message="Exclui o clip e os arquivos associados."
          />
        </div>
      </div>
    </div>
  );
}
