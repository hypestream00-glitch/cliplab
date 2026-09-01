import { prisma } from "@/lib/db/prisma";
import { PageHeader } from "@/components/dashboard/primitives";
import { formatBrlFromCents } from "@/lib/referral/config";
import { formatDateTime } from "@/lib/utils/format";
import Link from "next/link";

export const metadata = { title: "Saques de afiliados" };

export default async function AdminWithdrawalsPage() {
  const rows = await prisma.withdrawal.findMany({
    orderBy: { requestedAt: "desc" },
    take: 80,
    include: { user: { select: { id: true, name: true, email: true } } },
  });
  return (
    <div>
      <PageHeader title="Saques" description="Aprovar, rejeitar ou marcar PIX manual como pago. Sem gateway nesta fase." />
      <div className="overflow-x-auto rounded-2xl border bg-card">
        <table className="w-full min-w-[720px] text-left text-[13px]">
          <thead className="border-b text-[11px] text-muted-foreground">
            <tr>
              <th className="px-4 py-2">Usuário</th>
              <th>Valor</th>
              <th>PIX</th>
              <th>Data</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b last:border-0">
                <td className="px-4 py-2">
                  <Link href={`/admin/affiliates/withdrawals/${row.id}`} className="hover:underline">
                    {row.user.name ?? row.user.email}
                  </Link>
                </td>
                <td>{formatBrlFromCents(row.amountCents)}</td>
                <td>
                  {row.pixKeyType} · {row.pixKeyMasked}
                </td>
                <td>{formatDateTime(row.requestedAt)}</td>
                <td>{row.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
