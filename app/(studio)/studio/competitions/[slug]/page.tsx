import Link from "next/link";
import { requireWorkspaceContext } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/dashboard/primitives";
import { CompetitionStatusBadge } from "@/components/competitions/status-badge";
import { Button } from "@/components/ui/button";
import { formatBrlFromCents, rankingRulesTotal } from "@/lib/competitions/prizes";
import { formatDate, formatNumber } from "@/lib/utils/format";
import { getCompetitionRanking } from "@/lib/competitions/query";
import { joinCompetitionAction, submitCompetitionClipAction } from "@/app/(studio)/studio/competitions/actions";
import { canJoinStatus, canSubmitStatus, competitionDaysRemaining } from "@/lib/competitions/status";
import { isAllowedCompetitionPlatform } from "@/lib/competitions/platforms";
import type { PageParamsProps, PageSearchProps } from "@/types/routes";
import type { SocialPlatform } from "@/generated/prisma/client";

export const metadata = { title: "Campeonato" };

export default async function CompetitionDetailPage({
  params,
  searchParams,
}: PageParamsProps<{ slug: string }> & PageSearchProps) {
  const ctx = await requireWorkspaceContext();
  const { slug } = await params;
  const query = await searchParams;
  const error = typeof query.error === "string" ? query.error : null;
  const competition = await prisma.competition.findUnique({
    where: { slug },
    include: {
      prizeRules: { orderBy: { sortOrder: "asc" } },
      sources: { orderBy: { sortOrder: "asc" } },
      _count: { select: { participants: true } },
    },
  });
  if (!competition) notFound();
  const [participant, ranking, accounts, publications] = await Promise.all([
    prisma.competitionParticipant.findUnique({
      where: { competitionId_userId: { competitionId: competition.id, userId: ctx.user.id } },
    }),
    getCompetitionRanking(competition.id),
    prisma.socialAccount.findMany({
      where: {
        workspaceId: ctx.workspace.id,
        mock: false,
        status: { in: ["CONNECTED", "TOKEN_EXPIRING"] },
        platform: {
          in: competition.allowedPlatforms.filter((item): item is SocialPlatform => isAllowedCompetitionPlatform(item)),
        },
      },
    }),
    prisma.socialPublication.findMany({
      where: { workspaceId: ctx.workspace.id, status: "PUBLISHED", mock: false },
      include: { targets: true },
      take: 20,
      orderBy: { publishedAt: "desc" },
    }),
  ]);
  const totalViews = ranking.reduce((sum, row) => sum + row.validViews, 0);
  const remainingDays = competitionDaysRemaining(competition.endsAt);

  return (
    <div className="space-y-6">
      <PageHeader
        title={competition.name}
        description={competition.description ?? "Crie clips, publique e dispute o ranking."}
        actions={<CompetitionStatusBadge status={competition.status} />}
      />
      {error ? <p className="rounded-lg border border-destructive/40 px-3 py-2 text-[13px] text-destructive">{error}</p> : null}
      {competition.bannerUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={competition.bannerUrl} alt="" className="h-40 w-full rounded-2xl object-cover" />
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <article className="rounded-2xl border bg-card p-4">
          <p className="text-[12px] text-muted-foreground">Premiação</p>
          <p className="mt-1 text-[18px] font-semibold text-yellow-300">{formatBrlFromCents(competition.prizePoolCents)}</p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {competition.prizeMode === "HYBRID"
              ? `Ranking ${formatBrlFromCents(competition.rankingBudgetCents)} · Views ${formatBrlFromCents(competition.viewsBudgetCents)}`
              : competition.prizeMode === "VIEWS"
                ? "Premiação por visualizações"
                : `Ranking ${formatBrlFromCents(rankingRulesTotal(competition.prizeRules))}`}
          </p>
        </article>
        <article className="rounded-2xl border bg-card p-4">
          <p className="text-[12px] text-muted-foreground">Tempo restante</p>
          <p className="mt-1 text-[18px] font-semibold">{remainingDays} dias</p>
        </article>
        <article className="rounded-2xl border bg-card p-4">
          <p className="text-[12px] text-muted-foreground">Participantes</p>
          <p className="mt-1 text-[18px] font-semibold">{competition._count.participants}</p>
        </article>
        <article className="rounded-2xl border bg-card p-4">
          <p className="text-[12px] text-muted-foreground">Views válidas</p>
          <p className="mt-1 text-[18px] font-semibold">{formatNumber(totalViews)}</p>
        </article>
      </div>
      <p className="text-[13px] text-muted-foreground">
        {formatDate(competition.startsAt)} — {formatDate(competition.endsAt)} · {competition.allowedPlatforms.join(", ")}
      </p>
      {!participant && canJoinStatus(competition.status) ? (
        <form action={joinCompetitionAction}>
          <input type="hidden" name="competitionId" value={competition.id} />
          <input type="hidden" name="slug" value={competition.slug} />
          <Button type="submit">Participar</Button>
        </form>
      ) : participant ? (
        <Button asChild variant="outline">
          <Link href={`/studio/competitions/${competition.slug}/me`}>Meu desempenho</Link>
        </Button>
      ) : null}

      {competition.sources.length > 0 ? (
        <section>
          <h2 className="mb-2 text-[15px] font-semibold">Vídeos para clipar</h2>
          <div className="grid gap-2 md:grid-cols-2">
            {competition.sources.map((source) => (
              <article key={source.id} className="rounded-xl border bg-card p-3">
                <p className="text-[14px] font-medium">{source.title}</p>
                {source.projectId ? (
                  <Link href={`/studio/projects/${source.projectId}`} className="mt-2 inline-block text-[13px] text-primary">
                    Criar clip
                  </Link>
                ) : (
                  <p className="mt-2 text-[12px] text-muted-foreground">Use como referência. A importação automática por URL ainda não está disponível.</p>
                )}
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {participant && canSubmitStatus(competition.status) ? (
        <form action={submitCompetitionClipAction} className="rounded-2xl border bg-card p-4 space-y-3">
          <h2 className="text-[15px] font-semibold">Cadastrar publicação</h2>
          <input type="hidden" name="competitionId" value={competition.id} />
          <input type="hidden" name="slug" value={competition.slug} />
          <label className="block text-[13px]">
            Conta conectada
            <select name="socialAccountId" required className="mt-1 h-10 w-full rounded-md border bg-transparent px-2 text-[13px]">
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.platform} · {account.username}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-[13px]">
            Publicação do CortaClip
            <select name="publicationId" className="mt-1 h-10 w-full rounded-md border bg-transparent px-2 text-[13px]">
              <option value="">Selecionar (opcional)</option>
              {publications.map((publication) => (
                <option key={publication.id} value={publication.id}>
                  {publication.caption?.slice(0, 60) || publication.id}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-[13px]">
            Ou cole a URL
            <input name="postUrl" placeholder="https://..." className="mt-1 h-10 w-full rounded-md border bg-transparent px-2 text-[13px]" />
          </label>
          <Button type="submit">Enviar para análise</Button>
        </form>
      ) : null}

      {competition.rules ? (
        <section className="rounded-2xl border bg-card p-4">
          <h2 className="text-[15px] font-semibold">Regras</h2>
          <p className="mt-2 whitespace-pre-wrap text-[13px] text-muted-foreground">{competition.rules}</p>
        </section>
      ) : null}

      <section>
        <h2 className="mb-3 text-[15px] font-semibold">Ranking</h2>
        <div className="space-y-2 md:hidden">
          {ranking.map((row) => (
            <article key={row.participantId} className="rounded-xl border bg-card p-3">
              <p className="text-[14px] font-semibold">
                {row.position <= 3 ? ["🥇", "🥈", "🥉"][row.position - 1] : `${row.position}º`} {row.displayName}
              </p>
              <p className="mt-1 text-[12px] text-muted-foreground">
                {formatNumber(row.validViews)} views · {row.validClips} clips
              </p>
              <p className="mt-1 text-[13px] text-yellow-300">{formatBrlFromCents(row.estimatedPrizeCents)}</p>
            </article>
          ))}
        </div>
        <div className="hidden overflow-x-auto rounded-2xl border md:block">
          <table className="w-full min-w-[640px] text-left text-[13px]">
            <thead className="border-b bg-muted/40 text-[11px] uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Posição</th>
                <th className="px-3 py-2">Clipador</th>
                <th className="px-3 py-2">Views válidas</th>
                <th className="px-3 py-2">Clips</th>
                <th className="px-3 py-2">Prêmio estimado</th>
              </tr>
            </thead>
            <tbody>
              {ranking.map((row) => (
                <tr key={row.participantId} className="border-b last:border-0">
                  <td className="px-3 py-2 font-semibold">{row.position <= 3 ? ["🥇", "🥈", "🥉"][row.position - 1] : row.position}</td>
                  <td className="px-3 py-2">{row.displayName}</td>
                  <td className="px-3 py-2">{formatNumber(row.validViews)}</td>
                  <td className="px-3 py-2">{row.validClips}</td>
                  <td className="px-3 py-2 text-yellow-300">{formatBrlFromCents(row.estimatedPrizeCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
