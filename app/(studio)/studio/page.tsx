import Link from "next/link";
import { Plus } from "lucide-react";
import { requireWorkspaceContext } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { PageHeader, StatCard, EmptyState, StatusBadge } from "@/components/dashboard/primitives";
import { ClipCard } from "@/components/clips/clip-card";
import { Button } from "@/components/ui/button";
import { formatNumber, formatDateTime, fromNow, formatDuration } from "@/lib/utils/format";
import { mediaUrl } from "@/lib/storage/url";
import { visibleClipLibraryWhere, visibleProjectWhere, visiblePublicationWhere } from "@/lib/data/visibility";
import { formatMetricOrEmpty } from "@/lib/data/metrics-display";
import { getCliplabPublishedViews } from "@/lib/analytics/cliplab-views";
import { cliplabViewsEmptyHint } from "@/lib/analytics/provenance";
import { sessionGreetingName } from "@/lib/auth/identity";
import { formatMinutesUsed, getMonthlyUsage } from "@/lib/billing/usage";
import { ActiveCompetitionBanner } from "@/components/competitions/active-banner";

export default async function StudioHomePage() {
  const { user, workspace } = await requireWorkspaceContext();
  const projectWhere = { ...visibleProjectWhere(workspace.id), archivedAt: null };
  const clipWhere = visibleClipLibraryWhere(workspace.id);
  const [projects, clips, publications, projectCount, clipCount, publishedCount, cliplabViews, usage, socialCount, featuredCompetition] = await Promise.all([
    prisma.project.findMany({
      where: projectWhere,
      orderBy: { createdAt: "desc" },
      take: 6,
      include: { sourceVideo: true, _count: { select: { clips: { where: { storageKey: { not: null } } } } } },
    }),
    prisma.clip.findMany({
      where: clipWhere,
      orderBy: { createdAt: "desc" },
      take: 8,
      include: { score: true },
    }),
    prisma.socialPublication.findMany({
      where: { ...visiblePublicationWhere(workspace.id), status: { in: ["SCHEDULED", "QUEUED"] } },
      orderBy: { scheduledFor: "asc" },
      take: 5,
      include: { clip: true, targets: { include: { socialAccount: true } } },
    }),
    prisma.project.count({ where: projectWhere }),
    prisma.clip.count({ where: clipWhere }),
    prisma.socialPublication.count({
      where: { ...visiblePublicationWhere(workspace.id), status: "PUBLISHED" },
    }),
    getCliplabPublishedViews(workspace.id),
    getMonthlyUsage(workspace.id),
    prisma.socialAccount.count({ where: { workspaceId: workspace.id, status: "CONNECTED" } }),
    prisma.competition.findFirst({
      where: { status: { in: ["ACTIVE", "SCHEDULED"] } },
      orderBy: { prizePoolCents: "desc" },
    }),
  ]);

  const firstName = sessionGreetingName(user);
  const title = firstName ? `Olá, ${firstName}` : "Olá";

  return (
    <div className="mx-auto max-w-[1280px]">
      <PageHeader
        title={title}
        description="Envie um vídeo, receba clips e publique nas suas redes."
        actions={
          <Button asChild>
            <Link href="/studio/create">
              <Plus className="size-4" />
              Criar novo projeto
            </Link>
          </Button>
        }
      />

      {featuredCompetition ? (
        <ActiveCompetitionBanner
          name={featuredCompetition.name}
          slug={featuredCompetition.slug}
          prizePoolCents={featuredCompetition.prizePoolCents}
        />
      ) : null}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Projetos" value={formatNumber(projectCount)} />
        <StatCard label="Clips gerados" value={formatNumber(clipCount)} />
        <StatCard label="Clips publicados" value={formatNumber(publishedCount)} />
        <StatCard
          label="Visualizações"
          value={formatMetricOrEmpty(cliplabViews, cliplabViews != null ? formatNumber(cliplabViews) : "—")}
          hint={cliplabViews == null ? cliplabViewsEmptyHint() : "Visualizações de conteúdo publicado pelo CortaClip."}
        />
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <article className="rounded-2xl border bg-card p-4 hover:border-primary/40">
          <p className="text-[12px] text-muted-foreground">Plano atual</p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <p className="text-[16px] font-semibold">{usage.limits.name}</p>
            {usage.activeGrant ? (
              <span className="rounded-md border border-yellow-500/30 bg-yellow-500/10 px-1.5 py-0.5 text-[10px] text-yellow-300">
                🎁 Benefício ativo
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-[13px] text-muted-foreground">
            {formatMinutesUsed(usage.usedSeconds, usage.limits.monthlyMinutes)}
          </p>
          {usage.activeGrant ? (
            <p className="mt-1 text-[12px] text-yellow-400/90">
              {usage.activeGrant.source === "REFERRAL"
                ? `${usage.activeGrant.daysLeft} dia${usage.activeGrant.daysLeft === 1 ? "" : "s"} de Pro restantes`
                : `${usage.activeGrant.daysLeft} dia${usage.activeGrant.daysLeft === 1 ? "" : "s"} grátis restantes`}
            </p>
          ) : null}
          <Link href="/studio/settings/billing" className="mt-2 inline-block text-[12px] text-primary hover:underline">
            Gerenciar plano
          </Link>
        </article>
        <article className="rounded-2xl border bg-card p-4">
          <p className="text-[12px] text-muted-foreground">Contas sociais</p>
          <p className="mt-1 text-[16px] font-semibold">{formatNumber(socialCount)}</p>
          <p className="mt-1 text-[13px] text-muted-foreground">
            {socialCount === 0 ? "Conecte sua primeira rede social." : "Contas conectadas neste workspace."}
          </p>
          <Link href="/studio/accounts" className="mt-2 inline-block text-[12px] text-primary hover:underline">
            {socialCount === 0 ? "Conectar rede" : "Ver contas"}
          </Link>
        </article>
        <article className="rounded-2xl border bg-card p-4">
          <p className="text-[12px] text-muted-foreground">Ações rápidas</p>
          <div className="mt-2 flex flex-col gap-1 text-[13px]">
            <Link href="/studio/create" className="text-primary hover:underline">
              Novo projeto
            </Link>
            <Link href="/studio/accounts" className="text-muted-foreground hover:text-foreground">
              Conectar rede
            </Link>
            <Link href="/studio/calendar" className="text-muted-foreground hover:text-foreground">
              Ver calendário
            </Link>
          </div>
        </article>
      </div>

      <section className="mt-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[15px] font-semibold tracking-tight">Projetos recentes</h2>
          <Link href="/studio/projects" className="text-[12px] text-muted-foreground hover:text-foreground">
            Ver todos
          </Link>
        </div>
        {projects.length === 0 ? (
          <EmptyState
            title="Seu próximo vídeo pode virar vários clips."
            description="Envie um arquivo e a IA encontra os melhores momentos."
            actionLabel="Criar primeiro projeto"
            actionHref="/studio/create"
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {projects.map((project) => {
              const thumb = mediaUrl(project.sourceVideo?.thumbnailKey);
              return (
                <article key={project.id} className="flex gap-3 rounded-2xl border bg-card p-3 hover:border-primary/40">
                  {thumb ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={thumb} alt="" className="size-16 shrink-0 rounded-lg object-cover" />
                  ) : (
                    <div className="size-16 shrink-0 rounded-lg bg-muted" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <Link href={`/studio/projects/${project.id}`} className="truncate text-[13px] font-medium hover:underline">
                        {project.name}
                      </Link>
                      <StatusBadge status={project.status} />
                    </div>
                    <p className="mt-1 text-[12px] text-muted-foreground">
                      {project._count.clips} clips
                      {project.sourceVideo?.durationMs ? ` · ${formatDuration(project.sourceVideo.durationMs)}` : ""}
                      {" · "}
                      {fromNow(project.updatedAt)}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2 text-[12px]">
                      <Link href={`/studio/projects/${project.id}`} className="text-primary hover:underline">
                        Abrir
                      </Link>
                      <Link href={`/studio/projects/${project.id}`} className="text-muted-foreground hover:text-foreground">
                        Clips
                      </Link>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="mt-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[15px] font-semibold tracking-tight">Clips recentes</h2>
          <Link href="/studio/clips" className="text-[12px] text-muted-foreground hover:text-foreground">
            Ver todos
          </Link>
        </div>
        {clips.length === 0 ? (
          <EmptyState
            title="Seus clips aparecerão aqui depois que processarmos um vídeo."
            description="Comece enviando um MP4, MOV ou WEBM."
            actionLabel="Criar clips"
            actionHref="/studio/create"
          />
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
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
              />
            ))}
          </div>
        )}
      </section>

      <section className="mt-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[15px] font-semibold tracking-tight">Próximas publicações</h2>
          <Link href="/studio/calendar" className="text-[12px] text-muted-foreground hover:text-foreground">
            Calendário
          </Link>
        </div>
        {publications.length === 0 ? (
          <EmptyState title="Nenhuma publicação agendada." description="Quando você agendar um clip, ele aparece aqui." />
        ) : (
          <div className="divide-y rounded-2xl border bg-card">
            {publications.map((item) => (
              <Link
                key={item.id}
                href={`/studio/publishing?id=${item.id}`}
                className="flex items-center justify-between gap-3 px-4 py-3 text-[13px] hover:bg-muted/20"
              >
                <span className="truncate">{item.clip?.title ?? item.caption ?? "Sem legenda"}</span>
                <span className="shrink-0 text-muted-foreground">
                  {item.scheduledFor ? formatDateTime(item.scheduledFor) : "Na fila"}
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
