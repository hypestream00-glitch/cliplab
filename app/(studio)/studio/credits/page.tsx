import { requireWorkspaceContext } from "@/lib/auth/session";
import { PageHeader, StatCard, EmptyState } from "@/components/dashboard/primitives";
import { formatNumber, formatDate } from "@/lib/utils/format";
import Link from "next/link";
import { getDisplayCredits } from "@/lib/data/credits-display";

export const metadata = { title: "Créditos" };

export default async function CreditsPage() {
  const { workspace } = await requireWorkspaceContext();
  const { available, usage, periodUsed } = await getDisplayCredits(workspace.id).then((result) => ({
    available: result.available,
    usage: result.transactions,
    periodUsed: result.periodUsed,
  }));

  return (
    <div>
      <PageHeader
        title="Créditos"
        description="Histórico interno de créditos CLIPLAB. O limite do produto é medido em minutos de vídeo — veja Plano e uso."
        actions={
        <Link href="/studio/settings/billing" className="text-[13px] text-muted-foreground hover:text-foreground">
            Ver plano e minutos
          </Link>
        }
      />
      <div className="grid gap-3 md:grid-cols-2">
        <StatCard label="Saldo de créditos CLIPLAB" value={available == null ? "—" : formatNumber(available)} />
        <StatCard label="Uso no período" value={periodUsed > 0 ? formatNumber(periodUsed) : "—"} />
      </div>
      <h2 className="mt-6 mb-2 text-[13px] font-semibold">Histórico</h2>
      <div className="divide-y rounded-2xl border bg-card text-[13px]">
        {usage.length === 0 ? (
          <EmptyState title="Nenhuma transação ainda." description="O uso real de créditos CLIPLAB aparece aqui." />
        ) : (
          usage.map((item) => (
            <div key={item.id} className="flex justify-between gap-3 px-4 py-2.5">
              <span className="min-w-0 truncate">{item.description ?? "Uso de créditos"}</span>
              <span className="shrink-0 text-muted-foreground">{formatDate(item.createdAt)}</span>
              <span className="shrink-0 font-medium">{item.amount > 0 ? `+${item.amount}` : item.amount}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
