import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { CompetitionStatusBadge } from "@/components/competitions/status-badge";
import { formatBrlFromCents } from "@/lib/competitions/prizes";
import { getCompetitionRanking } from "@/lib/competitions/query";
import { adminAddOfficialSourceAction, adminDisqualifyParticipantAction, adminFinalizeCompetitionAction, adminUpdatePayoutAction, adminUpdateSubmissionAction } from "@/app/admin/competitions/actions";
import { Button } from "@/components/ui/button";
import type { PageParamsProps } from "@/types/routes";

export const metadata = { title: "Admin campeonato" };

export default async function AdminCompetitionDetailPage({ params }: PageParamsProps<{ id: string }>) {
  const { id } = await params;
  const competition = await prisma.competition.findUnique({
    where: { id },
    include: {
      participants: { include: { user: true } },
      submissions: { include: { user: true }, orderBy: { createdAt: "desc" } },
      payouts: true,
      audits: { orderBy: { createdAt: "desc" }, take: 20 },
      sources: { orderBy: { sortOrder: "asc" } },
    },
  });
  if (!competition) notFound();
  const ranking = await getCompetitionRanking(competition.id);
  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-[18px] font-semibold">{competition.name}</h1>
          <p className="text-[13px] text-muted-foreground">{formatBrlFromCents(competition.prizePoolCents)} · {competition.prizeMode}</p>
        </div>
        <CompetitionStatusBadge status={competition.status} />
      </div>
      <form action={adminFinalizeCompetitionAction}>
        <input type="hidden" name="competitionId" value={competition.id} />
        <Button type="submit" variant="outline">Finalizar ranking</Button>
      </form>
      <section>
        <h2 className="mb-2 text-[15px] font-semibold">Participantes</h2>
        {competition.participants.map((item) => (
          <form key={item.id} action={adminDisqualifyParticipantAction} className="mb-2 flex flex-wrap items-center gap-2 text-[13px]">
            <input type="hidden" name="participantId" value={item.id} />
            <span className="flex-1">{item.user.name ?? item.user.email} · {item.status}</span>
            {item.status === "ACTIVE" ? (
              <>
                <input name="note" placeholder="Motivo" className="h-8 rounded-md border bg-transparent px-2" />
                <Button type="submit" size="sm" variant="destructive">Desclassificar</Button>
              </>
            ) : null}
          </form>
        ))}
      </section>
      <section>
        <h2 className="mb-2 text-[15px] font-semibold">Vídeos oficiais</h2>
        {competition.sources.map((source) => (
          <p key={source.id} className="text-[13px]">{source.title} · {source.projectId ?? source.sourceUrl ?? "referência"}</p>
        ))}
        <form action={adminAddOfficialSourceAction} className="mt-2 grid gap-2 md:grid-cols-3">
          <input type="hidden" name="competitionId" value={competition.id} />
          <input name="title" placeholder="Título" className="h-9 rounded-md border bg-transparent px-2 text-[13px]" />
          <input name="projectId" placeholder="Project ID" className="h-9 rounded-md border bg-transparent px-2 text-[13px]" />
          <Button type="submit" size="sm">Associar</Button>
        </form>
      </section>
      <section>
        <h2 className="mb-2 text-[15px] font-semibold">Ranking</h2>
        {ranking.map((row) => (
          <p key={row.participantId} className="text-[13px]">
            {row.position}. {row.displayName} · {row.validViews} views · {formatBrlFromCents(row.estimatedPrizeCents)}
          </p>
        ))}
      </section>
      <section>
        <h2 className="mb-2 text-[15px] font-semibold">Submissões</h2>
        {competition.submissions.map((item) => (
          <form key={item.id} action={adminUpdateSubmissionAction} className="mb-2 flex flex-wrap items-center gap-2 rounded-lg border p-2 text-[13px]">
            <input type="hidden" name="submissionId" value={item.id} />
            <span className="flex-1">{item.user.name ?? item.user.email} · {item.platform} · {item.postExternalId}</span>
            <CompetitionStatusBadge status={item.status} />
            <select name="status" defaultValue={item.status} className="h-8 rounded-md border bg-transparent px-2">
              <option value="PENDING">Em análise</option>
              <option value="VERIFIED">Verificado</option>
              <option value="REJECTED">Rejeitar</option>
              <option value="FLAGGED">Flag</option>
              <option value="REMOVED">Remover</option>
            </select>
            <input name="note" placeholder="Nota" className="h-8 rounded-md border bg-transparent px-2" />
            <Button type="submit" size="sm">Salvar</Button>
          </form>
        ))}
      </section>
      <section>
        <h2 className="mb-2 text-[15px] font-semibold">Payouts</h2>
        {competition.payouts.map((item) => (
          <form key={item.id} action={adminUpdatePayoutAction} className="mb-2 flex flex-wrap items-center gap-2 rounded-lg border p-2 text-[13px]">
            <input type="hidden" name="payoutId" value={item.id} />
            <span className="flex-1">{formatBrlFromCents(item.amountCents)} · {item.kind} · #{item.position ?? "—"}</span>
            <select name="status" defaultValue={item.status} className="h-8 rounded-md border bg-transparent px-2">
              <option value="PENDING">PENDING</option>
              <option value="APPROVED">APPROVED</option>
              <option value="PAID">PAID</option>
            </select>
            <Button type="submit" size="sm">Atualizar</Button>
          </form>
        ))}
      </section>
      <section>
        <h2 className="mb-2 text-[15px] font-semibold">Audit log</h2>
        {competition.audits.map((item) => (
          <p key={item.id} className="text-[12px] text-muted-foreground">
            {item.createdAt.toISOString()} · {item.action} · {item.entityType}
          </p>
        ))}
      </section>
    </div>
  );
}
