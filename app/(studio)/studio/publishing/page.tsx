import { requireWorkspaceContext } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { PageHeader, StatusBadge, EmptyState } from "@/components/dashboard/primitives";
import { formatDateTime, formatDuration } from "@/lib/utils/format";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ComposeForm } from "@/components/publishing/compose-form";
import { DevNotice } from "@/components/dashboard/dev-notice";
import { publishNowAction, retryPublicationAction, cancelPublicationAction } from "@/app/(studio)/studio/publishing/actions";
import { getUsableAccessToken } from "@/lib/services/social-accounts";
import { getSocialProvider } from "@/lib/social";
import { mediaUrl } from "@/lib/storage/url";
import { PublishingRefresh } from "@/components/publishing/publishing-refresh";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import type { PageSearchProps } from "@/types/routes";
import { isUploadPostPrimary } from "@/lib/social/router";
import { clipHasRenderableVideo } from "@/lib/social/upload-post/publish";
import { visibleClipLibraryWhere, visiblePublicationWhere, visibleSocialAccountWhere } from "@/lib/data/visibility";

export const metadata = { title: "Publicação" };

export default async function PublishingPage({ searchParams }: PageSearchProps) {
  const { workspace } = await requireWorkspaceContext();
  const params = await searchParams;
  const clipId = typeof params.clip === "string" ? params.clip : "";
  const publicationId = typeof params.id === "string" ? params.id : "";
  const error = typeof params.error === "string" ? params.error : "";
  const mode = params.mode === "schedule" || params.mode === "queue" ? params.mode : "now";

  const [posts, accounts, clip, selected, readyClips] = await Promise.all([
    prisma.socialPublication.findMany({
      where: visiblePublicationWhere(workspace.id),
      include: { targets: { include: { socialAccount: true } }, clip: true },
      orderBy: { createdAt: "desc" },
      take: 80,
    }),
    prisma.socialAccount.findMany({
      where: {
        ...visibleSocialAccountWhere(workspace.id),
        status: { in: ["CONNECTED", "TOKEN_EXPIRING"] },
      },
    }),
    clipId
      ? prisma.clip.findFirst({ where: { id: clipId, ...visibleClipLibraryWhere(workspace.id) } })
      : Promise.resolve(null),
    publicationId
      ? prisma.socialPublication.findFirst({
          where: { id: publicationId, ...visiblePublicationWhere(workspace.id) },
          include: { targets: { include: { socialAccount: true } }, clip: true },
        })
      : Promise.resolve(null),
    !clipId
      ? prisma.clip.findMany({
          where: visibleClipLibraryWhere(workspace.id),
          orderBy: { createdAt: "desc" },
          take: 8,
          include: { score: true },
        })
      : Promise.resolve([]),
  ]);

  const tiktok = accounts.find((account) => account.platform === "TIKTOK" && !account.mock);
  let creatorInfo = null;
  let creatorError: string | null = null;
  const unified = isUploadPostPrimary();
  if (!unified && tiktok && clip) {
    try {
      const token = await getUsableAccessToken(tiktok);
      creatorInfo = (await getSocialProvider("TIKTOK").getCreatorInfo?.(token)) ?? null;
    } catch (err) {
      creatorError = err instanceof Error ? err.message : "Não foi possível ler as opções do criador TikTok.";
    }
  }
  const hasVideo = clip ? await clipHasRenderableVideo(clip.id, workspace.id) : false;

  const live = posts.some((post) => ["QUEUED", "UPLOADING", "PROCESSING"].includes(post.status));

  return (
    <div>
      <PublishingRefresh active={live} />
      <PageHeader
        title="Publicar"
        description="Escolha um clip, a rede e o momento de enviar."
        actions={
          <div className="flex gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href="/studio/calendar">Calendário</Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/studio/publishing/queue">Fila</Link>
            </Button>
          </div>
        }
      />
      {clip ? (
        <ComposeForm
          clipId={clip.id}
          clipTitle={clip.title}
          caption={clip.suggestedCaption ?? clip.title}
          hashtags={clip.hashtags}
          thumbnail={mediaUrl(clip.thumbnailKey)}
          accounts={accounts.filter((account) => account.status === "CONNECTED" || account.status === "TOKEN_EXPIRING")}
          creatorInfo={creatorInfo}
          creatorError={unified ? null : creatorError}
          defaultMode={mode}
          error={
            error === "accounts"
              ? "Selecione ao menos uma conta conectada."
              : error || (!hasVideo ? "Gere o render final antes de publicar." : undefined)
          }
          timezone="America/Sao_Paulo"
          clipVertical={Boolean(clip.height && clip.width && clip.height > clip.width) || (!clip.width && !clip.height)}
          unified={unified}
          hasVideo={hasVideo}
        />
      ) : (
        <div className="mb-6">
          <p className="mb-3 text-[13px] text-muted-foreground">1. Selecione um clip</p>
          {readyClips.length === 0 ? (
            <EmptyState
              title="Nenhum clip pronto para publicar."
              description="Gere clips a partir de um vídeo primeiro."
              actionLabel="Criar clips"
              actionHref="/studio/create"
            />
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
              {readyClips.map((item) => {
                const thumb = mediaUrl(item.thumbnailKey);
                return (
                  <Link
                    key={item.id}
                    href={`/studio/publishing?clip=${item.id}`}
                    className="overflow-hidden rounded-2xl border bg-card hover:border-primary/50"
                  >
                    <div className="relative aspect-[9/16] bg-zinc-950">
                      {thumb ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={thumb} alt="" className="absolute inset-0 h-full w-full object-cover" />
                      ) : null}
                      <span className="absolute right-2 bottom-2 rounded bg-black/70 px-1.5 py-0.5 text-[11px] text-white">
                        {formatDuration(item.durationMs)}
                      </span>
                    </div>
                    <p className="line-clamp-2 p-2 text-[12px] font-medium">{item.title}</p>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      )}

      {selected ? (
        <article className="mb-5 rounded-2xl border border-border bg-card p-5 text-[13px]">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="font-medium">{selected.clip?.title ?? selected.caption ?? "Publicação"}</p>
              <p className="text-muted-foreground">
                {selected.targets.map((target) => `${target.platform} @${target.socialAccount.username}`).join(", ") || "Sem alvo"}
              </p>
            </div>
            <StatusBadge status={selected.status} />
          </div>
          {selected.mock ? (
            <div className="mt-3">
              <DevNotice>Esta publicação inclui destinos que não são TikTok real.</DevNotice>
            </div>
          ) : null}
          {selected.errorMessage ? <p className="mt-2 text-destructive">{selected.errorMessage}</p> : null}
          {selected.targets.map((target) =>
            target.errorMessage ? (
              <p key={target.id} className="mt-1 text-[12px] text-destructive">
                {target.platform}: {target.errorMessage}
              </p>
            ) : null,
          )}
          {selected.status === "SCHEDULED" || selected.status === "QUEUED" || selected.status === "DRAFT" ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {selected.status === "SCHEDULED" ? (
                selected.mock ? (
                  <form action={publishNowAction}>
                    <input type="hidden" name="publicationId" value={selected.id} />
                    <Button size="sm" type="submit">
                      Publicar agora
                    </Button>
                  </form>
                ) : (
                  <ConfirmSubmit
                    action={publishNowAction}
                    name="publicationId"
                    value={selected.id}
                    extra={{ confirmRealPublish: "1" }}
                    label="Publicar agora"
                    confirmLabel="Publicar agora"
                    message="Publicar este clip nesta conta?"
                    size="sm"
                    variant="outline"
                  />
                )
              ) : null}
              <ConfirmSubmit
                action={cancelPublicationAction}
                name="publicationId"
                value={selected.id}
                label="Cancelar publicação"
                destructive
              />
            </div>
          ) : null}
          {selected.status === "FAILED" ? (
            <form action={retryPublicationAction} className="mt-3">
              <input type="hidden" name="publicationId" value={selected.id} />
              <Button size="sm" type="submit">
                Tentar novamente
              </Button>
            </form>
          ) : null}
        </article>
      ) : null}

      {posts.length === 0 ? (
        <EmptyState
          title="Nenhuma publicação ainda."
          description="Gere um clipe e envie para as contas conectadas."
          actionLabel="Ver clipes"
          actionHref="/studio/clips"
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-left text-[13px]">
            <thead className="border-b bg-muted/30 text-[11px] text-muted-foreground uppercase">
              <tr>
                {["Conteúdo", "TikTok", "Conta", "Legenda", "Status", "Horário", "Ações"].map((col) => (
                  <th key={col} className="px-3 py-2 font-medium">
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {posts.map((post) => {
                const target = post.targets[0];
                const thumb = mediaUrl(post.clip?.thumbnailKey);
                const retryable = (target?.failureCode ?? "") && ["timeout", "unavailable", "rate_limit_exceeded", "internal", "network"].includes(target?.failureCode ?? "");
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
                        <span>{post.clip?.title ?? post.caption ?? "Rascunho"}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2">{target?.platform ?? "—"}</td>
                    <td className="px-3 py-2">@{target?.socialAccount.username ?? "—"}</td>
                    <td className="max-w-[220px] truncate px-3 py-2">{post.caption}</td>
                    <td className="px-3 py-2">
                      <StatusBadge status={post.status} />
                      {target?.errorMessage ? <p className="mt-1 text-[11px] text-destructive">{target.errorMessage}</p> : null}
                    </td>
                    <td className="px-3 py-2">
                      {post.scheduledFor
                        ? formatDateTime(post.scheduledFor)
                        : post.publishedAt
                          ? formatDateTime(post.publishedAt)
                          : "—"}
                    </td>
                    <td className="px-3 py-2">
                      <Link href={`/studio/publishing?id=${post.id}`} className="underline">
                        Abrir
                      </Link>
                      {post.status === "FAILED" && retryable ? (
                        <form action={retryPublicationAction} className="mt-1">
                          <input type="hidden" name="publicationId" value={post.id} />
                          <Button size="xs" variant="outline" type="submit">
                            Tentar novamente
                          </Button>
                        </form>
                      ) : null}
                      {post.status === "SCHEDULED" || post.status === "QUEUED" || post.status === "DRAFT" ? (
                        <ConfirmSubmit
                          action={cancelPublicationAction}
                          name="publicationId"
                          value={post.id}
                          label="Cancelar"
                          destructive
                          size="xs"
                        />
                      ) : null}
                    </td>
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
