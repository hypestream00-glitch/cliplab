import { PageHeader, StatCard } from "@/components/dashboard/primitives";
import { adminAffiliateRows, adminAffiliateSummary } from "@/lib/referral/admin";
import { formatBrlFromCents } from "@/lib/referral/config";
import Link from "next/link";

export const metadata = { title: "Afiliados" };

export default async function AdminAffiliatesPage() {
  const [summary, rows] = await Promise.all([adminAffiliateSummary(), adminAffiliateRows()]);
  return (
    <div>
      <PageHeader title="Afiliados" description="Programa de indicação com saldo sacável. PIX manual, sem gateway." />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard label="Total de afiliados" value={String(summary.affiliates)} />
        <StatCard label="Cadastros indicados" value={String(summary.attributions)} />
        <StatCard label="Assinaturas indicadas" value={String(summary.conversions)} />
        <StatCard label="Saldo pendente" value={formatBrlFromCents(summary.pendingCents)} />
        <StatCard label="Saldo disponível" value={formatBrlFromCents(summary.availableCents)} />
        <StatCard label="Total pago" value={formatBrlFromCents(summary.paidCents)} />
      </div>
      <div className="mt-4">
        <Link href="/admin/affiliates/withdrawals" className="text-[13px] text-muted-foreground hover:text-foreground">
          Ver saques →
        </Link>
      </div>
      <div className="mt-6 overflow-x-auto rounded-2xl border bg-card">
        <table className="w-full min-w-[720px] text-left text-[13px]">
          <thead className="border-b text-[11px] text-muted-foreground">
            <tr>
              <th className="px-4 py-2">Afiliado</th>
              <th>Indicações</th>
              <th>Conversões</th>
              <th>Saldo</th>
              <th>Saques</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.userId} className="border-b last:border-0">
                <td className="px-4 py-2">
                  <Link href={`/admin/affiliates/${row.userId}`} className="hover:underline">
                    {row.name ?? row.email}
                  </Link>
                  <p className="text-[11px] text-muted-foreground">{row.email}</p>
                </td>
                <td>{row.invited}</td>
                <td>{row.converted}</td>
                <td>
                  {formatBrlFromCents(row.availableCents)}
                  <span className="block text-[11px] text-muted-foreground">pendente {formatBrlFromCents(row.pendingCents)}</span>
                </td>
                <td>{row.withdrawals}</td>
                <td>{row.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
