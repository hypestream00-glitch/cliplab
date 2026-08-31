import { prisma } from "@/lib/db/prisma";
import { PageHeader } from "@/components/dashboard/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { adminGrantCreditsAction } from "@/app/admin/actions";
import { formatNumber } from "@/lib/utils/format";
import { stripeSecretMode } from "@/lib/billing/stripe-mode";

export default async function AdminBillingPage() {
  const [subs, workspaces] = await Promise.all([
    prisma.subscription.findMany({ include: { plan: true, workspace: true } }),
    prisma.workspace.findMany({ include: { creditBalance: true }, orderBy: { createdAt: "desc" }, take: 40 }),
  ]);
  return (
    <div>
      <PageHeader title="Billing admin" description="Conceda créditos sem inventar métricas. Ajuste entra no ledger." />
      {process.env.NODE_ENV !== "production" && stripeSecretMode() === "TEST" ? (
        <p className="mb-3 text-[11px] text-muted-foreground">Stripe Test Mode</p>
      ) : null}
      <form action={adminGrantCreditsAction} className="mb-6 flex max-w-xl flex-wrap gap-2">
        <select name="workspaceId" required className="h-8 min-w-48 rounded-md border bg-transparent px-2 text-[13px]">
          {workspaces.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name} · {formatNumber(item.creditBalance?.available ?? 0)} cr
            </option>
          ))}
        </select>
        <Input name="amount" type="number" min={1} required placeholder="Créditos" className="h-8 w-32" />
        <Button type="submit" size="sm">
          Conceder
        </Button>
      </form>
      <table className="w-full text-left text-[13px]">
        <thead className="border-b text-[11px] text-muted-foreground">
          <tr>
            <th className="py-2">Workspace</th>
            <th>Plano</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {subs.map((item) => (
            <tr key={item.id} className="border-b">
              <td className="py-2">{item.workspace.name}</td>
              <td>{item.plan.name}</td>
              <td>{item.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
