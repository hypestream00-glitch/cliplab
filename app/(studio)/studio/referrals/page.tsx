import { requireWorkspaceContext } from "@/lib/auth/session";
import { PageHeader, StatCard, EmptyState } from "@/components/dashboard/primitives";
import { Button } from "@/components/ui/button";
import { ensureReferralProfile } from "@/lib/referral/profile";
import { affiliateDashboard } from "@/lib/referral/stats";
import { formatBrlFromCents, MIN_WITHDRAWAL_CENTS } from "@/lib/referral/config";
import { appPathUrl } from "@/lib/email/app-url";
import { formatDate, formatDateTime } from "@/lib/utils/format";
import { WithdrawalForm } from "@/components/referral/withdrawal-form";
import { ReferralCopyButton } from "@/components/referral/copy-link";
import { cancelWithdrawalAction } from "@/app/(studio)/studio/referrals/actions";
import type { PageSearchProps } from "@/types/routes";

export const metadata = { title: "Indique e ganhe" };

function rewardStatusLabel(status: string) {
  if (status === "PENDING") return "Pendente";
  if (status === "AVAILABLE") return "Disponível";
  if (status === "CANCELLED") return "Cancelada";
  if (status === "GRANTED") return "Pro legado";
  return status;
}

function withdrawalTone(status: string) {
  if (status === "REQUESTED") return "bg-yellow-500/15 text-yellow-300";
  if (status === "APPROVED") return "bg-sky-500/15 text-sky-300";
  if (status === "PAID") return "bg-emerald-500/15 text-emerald-300";
  if (status === "REJECTED") return "bg-red-500/15 text-red-300";
  return "bg-muted text-muted-foreground";
}

function withdrawalLabel(status: string) {
  if (status === "REQUESTED") return "Solicitado";
  if (status === "APPROVED") return "Aprovado";
  if (status === "PAID") return "Pago";
  if (status === "REJECTED") return "Rejeitado";
  if (status === "CANCELLED") return "Cancelado";
  return status;
}

export default async function ReferralsPage({ searchParams }: PageSearchProps) {
  const { user, workspace } = await requireWorkspaceContext();
  const params = await searchParams;
  const profile = await ensureReferralProfile(user.id);
  const data = await affiliateDashboard(user.id, workspace.id);
  const url = appPathUrl(`/r/${profile.code}`);
  const missing = Math.max(0, MIN_WITHDRAWAL_CENTS - data.availableCents);
  const error = typeof params.error === "string" ? params.error : null;
  const ok = typeof params.ok === "string" ? params.ok : null;

  return (
    <div>
      <PageHeader
        title="Indique e ganhe"
        description="A cada amigo que fizer a primeira assinatura paga você recebe R$5 de saldo sacável e +30 minutos de IA. O PIX é pago manualmente pelo administrador."
      />
      {error ? <p className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-[13px] text-red-300">{error}</p> : null}
      {ok === "requested" ? <p className="mb-4 rounded-lg border px-3 py-2 text-[13px] text-muted-foreground">Saque solicitado. Aguarde a análise do administrador.</p> : null}
      {ok === "cancelled" ? <p className="mb-4 rounded-lg border px-3 py-2 text-[13px] text-muted-foreground">Pedido de saque cancelado. O valor voltou para o saldo disponível.</p> : null}

      <section className="rounded-2xl border border-border bg-card p-5">
        <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Meu link</p>
        <p className="mt-2 break-all font-mono text-[13px] text-white">{url}</p>
        <div className="mt-3">
          <ReferralCopyButton url={url} />
        </div>
      </section>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="💰 Saldo disponível" value={formatBrlFromCents(data.availableCents)} />
        <StatCard label="⏳ Saldo pendente" value={formatBrlFromCents(data.pendingCents)} />
        <StatCard label="💸 Total sacado" value={formatBrlFromCents(data.totalWithdrawnCents)} />
        <StatCard label="⚡ Minutos ganhos" value={`${data.minutesGranted} min`} />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <WithdrawalForm availableCents={data.availableCents} />
        {data.availableCents < MIN_WITHDRAWAL_CENTS ? (
          <p className="text-[13px] text-muted-foreground">
            Você precisa de mais {formatBrlFromCents(missing)} para solicitar um saque.
          </p>
        ) : null}
      </div>

      <section className="mt-6 rounded-2xl border border-border bg-card p-5">
        <p className="text-[13px] font-medium text-white">Próxima conquista</p>
        <p className="mt-1 text-[13px] text-muted-foreground">
          {data.milestone.complete
            ? "Você atingiu a meta visual atual. Bônus extras ainda não são pagos automaticamente."
            : `Falta ${data.milestone.remaining} assinatura${data.milestone.remaining === 1 ? "" : "s"} para sua próxima conquista.`}
        </p>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full gradient-primary" style={{ width: `${Math.round(data.milestone.ratio * 100)}%` }} />
        </div>
        <p className="mt-2 text-[12px] text-muted-foreground">
          {data.milestone.current}/{data.milestone.target} assinaturas · sem bônus financeiro extra nesta fase
        </p>
      </section>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <StatCard label="Cliques" value={String(data.clicks)} />
        <StatCard label="Indicados cadastrados" value={String(data.invited)} />
        <StatCard label="Indicados que assinaram" value={String(data.converted)} />
      </div>

      <h2 className="mt-8 mb-2 text-[15px] font-semibold">Histórico de recompensas</h2>
      <div className="overflow-x-auto rounded-2xl border bg-card">
        {data.rewards.length === 0 ? (
          <EmptyState title="Nenhuma recompensa ainda." description="A recompensa só aparece depois da primeira assinatura paga do indicado." />
        ) : (
          <table className="w-full min-w-[640px] text-left text-[13px]">
            <thead className="border-b text-[11px] text-muted-foreground">
              <tr>
                <th className="px-4 py-2">Data</th>
                <th>Evento</th>
                <th>Valor</th>
                <th>Minutos</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {data.rewards.map((row) => (
                <tr key={row.id} className="border-b last:border-0">
                  <td className="px-4 py-2">{formatDate(row.createdAt)}</td>
                  <td>Indicação confirmada</td>
                  <td>{row.cashAmountCents ? `+${formatBrlFromCents(row.cashAmountCents)}` : "—"}</td>
                  <td>{row.aiMinutes ? `+${row.aiMinutes} min` : row.days ? `${row.days} dias Pro` : "—"}</td>
                  <td>{rewardStatusLabel(row.status)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <h2 className="mt-8 mb-2 text-[15px] font-semibold">Histórico de saques</h2>
      <div className="overflow-x-auto rounded-2xl border bg-card">
        {data.withdrawals.length === 0 ? (
          <EmptyState title="Nenhum saque solicitado." description="Quando o saldo disponível chegar a R$ 30, você pode pedir o PIX manual." />
        ) : (
          <table className="w-full min-w-[640px] text-left text-[13px]">
            <thead className="border-b text-[11px] text-muted-foreground">
              <tr>
                <th className="px-4 py-2">Valor</th>
                <th>Solicitado em</th>
                <th>Status</th>
                <th>Pago em</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data.withdrawals.map((row) => (
                <tr key={row.id} className="border-b last:border-0">
                  <td className="px-4 py-2">{formatBrlFromCents(row.amountCents)}</td>
                  <td>{formatDateTime(row.requestedAt)}</td>
                  <td>
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${withdrawalTone(row.status)}`}>
                      {withdrawalLabel(row.status)}
                    </span>
                  </td>
                  <td>{row.paidAt ? formatDateTime(row.paidAt) : "—"}</td>
                  <td className="px-4 py-2 text-right">
                    {row.status === "REQUESTED" ? (
                      <form action={cancelWithdrawalAction}>
                        <input type="hidden" name="withdrawalId" value={row.id} />
                        <Button type="submit" variant="ghost" size="sm">
                          Cancelar
                        </Button>
                      </form>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
