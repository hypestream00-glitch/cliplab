import { prisma } from "@/lib/db/prisma";
import { notFound } from "next/navigation";
import { PageHeader, StatCard } from "@/components/dashboard/primitives";
import { formatBrlFromCents } from "@/lib/referral/config";
import { appPathUrl } from "@/lib/email/app-url";
import { formatDateTime } from "@/lib/utils/format";
import { walletBalance } from "@/lib/referral/wallet";
import { adminWalletAdjustAction } from "@/app/admin/affiliates/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Link from "next/link";

export default async function AdminAffiliateDetailPage({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      referralProfile: true,
      referralsMade: { orderBy: { attributedAt: "desc" }, take: 40, include: { referred: { select: { email: true, name: true } } } },
      referralRewards: { orderBy: { createdAt: "desc" }, take: 40 },
      withdrawals: { orderBy: { requestedAt: "desc" }, take: 40 },
      affiliateFlags: { orderBy: { createdAt: "desc" }, take: 20 },
    },
  });
  if (!user) notFound();
  const balance = await walletBalance(user.id);
  const audits = await prisma.auditLog.findMany({
    where: {
      OR: [{ userId: user.id }, { entityId: user.id, entityType: "User" }],
      action: { startsWith: "REFERRAL" },
    },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  const link = user.referralProfile ? appPathUrl(`/r/${user.referralProfile.code}`) : "—";

  return (
    <div>
      <PageHeader title={user.name ?? user.email ?? "Afiliado"} description={user.email ?? undefined} />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Código" value={user.referralProfile?.code ?? "—"} />
        <StatCard label="Disponível" value={formatBrlFromCents(balance.available)} />
        <StatCard label="Pendente" value={formatBrlFromCents(balance.pending)} />
        <StatCard label="Indicações" value={String(user.referralsMade.length)} />
      </div>
      <p className="mt-3 break-all text-[13px] text-muted-foreground">{link}</p>

      <h2 className="mt-8 mb-2 text-[15px] font-semibold">Indicados</h2>
      <div className="overflow-x-auto rounded-xl border text-[13px]">
        <table className="w-full min-w-[520px] text-left">
          <thead className="border-b text-[11px] text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Usuário</th>
              <th>Código</th>
              <th>Convertido</th>
            </tr>
          </thead>
          <tbody>
            {user.referralsMade.map((row) => (
              <tr key={row.id} className="border-b last:border-0">
                <td className="px-3 py-2">{row.referred.name ?? row.referred.email}</td>
                <td>{row.code}</td>
                <td>{row.convertedAt ? formatDateTime(row.convertedAt) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="mt-8 mb-2 text-[15px] font-semibold">Recompensas</h2>
      <div className="overflow-x-auto rounded-xl border text-[13px]">
        <table className="w-full min-w-[560px] text-left">
          <thead className="border-b text-[11px] text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Valor</th>
              <th>Minutos</th>
              <th>Status</th>
              <th>Review</th>
            </tr>
          </thead>
          <tbody>
            {user.referralRewards.map((row) => (
              <tr key={row.id} className="border-b last:border-0">
                <td className="px-3 py-2">{formatBrlFromCents(row.cashAmountCents)}</td>
                <td>{row.aiMinutes}</td>
                <td>{row.status}</td>
                <td>{row.reviewStatus}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="mt-8 mb-2 text-[15px] font-semibold">Saques</h2>
      <ul className="space-y-1 text-[13px]">
        {user.withdrawals.map((row) => (
          <li key={row.id}>
            <Link href={`/admin/affiliates/withdrawals/${row.id}`} className="hover:underline">
              {formatBrlFromCents(row.amountCents)} · {row.status} · {row.pixKeyMasked}
            </Link>
          </li>
        ))}
      </ul>

      <h2 className="mt-8 mb-2 text-[15px] font-semibold">Flags</h2>
      <ul className="space-y-1 text-[13px] text-muted-foreground">
        {user.affiliateFlags.length === 0 ? <li>Nenhuma</li> : null}
        {user.affiliateFlags.map((row) => (
          <li key={row.id}>
            {row.status} · {row.reason} · {formatDateTime(row.createdAt)}
          </li>
        ))}
      </ul>

      <h2 className="mt-8 mb-2 text-[15px] font-semibold">Ajuste manual de saldo</h2>
      <p className="mb-2 text-[12px] text-muted-foreground">Exige motivo. Entra no ledger e no audit log. Não use para pagar PIX.</p>
      <form action={adminWalletAdjustAction} className="flex max-w-xl flex-wrap gap-2">
        <input type="hidden" name="userId" value={user.id} />
        <Input name="amount" type="number" step="0.01" placeholder="Valor (ex: 5 ou -5)" className="h-8 w-36" required />
        <Input name="reason" placeholder="Motivo obrigatório" className="h-8 min-w-48 flex-1" required />
        <Button type="submit" size="sm">
          Registrar
        </Button>
      </form>

      <h2 className="mt-8 mb-2 text-[15px] font-semibold">Audit log recente</h2>
      <ul className="space-y-1 text-[12px] text-muted-foreground">
        {audits.map((row) => (
          <li key={row.id}>
            {formatDateTime(row.createdAt)} · {row.action}
          </li>
        ))}
      </ul>
    </div>
  );
}
