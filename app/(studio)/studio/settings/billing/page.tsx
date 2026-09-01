import { requireWorkspaceContext } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { PageHeader, StatCard } from "@/components/dashboard/primitives";
import { Button } from "@/components/ui/button";
import { formatDate, formatNumber } from "@/lib/utils/format";
import { PRODUCT_PLAN_CODES, PLAN_LIMITS, productPlanCode } from "@/lib/config/plans";
import { planPriceLabel } from "@/lib/config/plan-commerce";
import { changePlanAction, manageSubscriptionAction } from "@/app/(studio)/studio/settings/billing/actions";
import { isBillingCheckoutEnabled } from "@/lib/billing/provider";
import { canManageBilling } from "@/lib/billing/policy";
import { subscriptionStatusLabel } from "@/lib/billing/stripe-status";
import type { PageSearchProps } from "@/types/routes";
import { getMonthlyUsage, formatMinutesUsed } from "@/lib/billing/usage";
import { visibleSocialAccountWhere } from "@/lib/data/visibility";
import { PromoRedeemForm } from "@/components/billing/promo-redeem-form";
import Link from "next/link";

export default async function BillingPage({ searchParams }: PageSearchProps) {
  const { workspace, role } = await requireWorkspaceContext();
  const params = await searchParams;
  const [subscription, usage, accountCount] = await Promise.all([
    prisma.subscription.findUnique({ where: { workspaceId: workspace.id }, include: { plan: true } }),
    getMonthlyUsage(workspace.id),
    prisma.socialAccount.count({ where: visibleSocialAccountWhere(workspace.id) }),
  ]);
  const plan = usage.limits;
  const checkoutReady = isBillingCheckoutEnabled();
  const paymentsUnavailable = params.payments === "configuring" || !checkoutReady;
  const usedMinutesPct = plan.monthlyMinutes > 0 ? Math.min(100, (usage.usedSeconds / (plan.monthlyMinutes * 60)) * 100) : 0;
  const currentCode = productPlanCode(usage.effectivePlanCode);
  const canManage = canManageBilling(role);
  const paid = currentCode !== "FREE";
  const availableMinutes = Math.max(0, Math.round(usage.remainingSeconds / 60));

  return (
    <div>
      <PageHeader
        title="Plano e uso"
        description="Acompanhe o plano, a próxima renovação e os limites da sua conta. O plano só muda depois da confirmação do pagamento."
      />
      {paymentsUnavailable ? (
        <p className="mb-4 rounded-lg border border-dashed px-3 py-2 text-[13px] text-muted-foreground">
          Não foi possível iniciar o pagamento agora. Tente novamente em instantes.
        </p>
      ) : null}
      {params.downgrade === "scheduled" || subscription?.cancelAtPeriodEnd ? (
        <p className="mb-4 rounded-lg border px-3 py-2 text-[13px] text-muted-foreground">
          A mudança para o plano Free fica para o final do período. Seus dados permanecem.
        </p>
      ) : null}
      {params.error === "forbidden" ? (
        <p className="mb-4 text-[13px] text-destructive">Somente o responsável pela conta pode alterar a assinatura.</p>
      ) : null}
      {params.error === "invalid-plan" ? (
        <p className="mb-4 text-[13px] text-destructive">Não foi possível alterar o plano.</p>
      ) : null}
      <div className="grid gap-3 md:grid-cols-3">
        <StatCard label="Plano atual" value={plan.name} />
        <StatCard label="Status" value={subscriptionStatusLabel(usage.status)} />
        <StatCard
          label="Próxima renovação"
          value={usage.periodEnd ? formatDate(usage.periodEnd) : "—"}
        />
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-3">
        <StatCard label="Uso mensal" value={formatMinutesUsed(usage.usedSeconds, plan.monthlyMinutes)} />
        <StatCard label="Minutos usados" value={`${Math.round(usage.usedSeconds / 60)}`} />
        <StatCard label="Minutos disponíveis" value={`${availableMinutes}`} />
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-3">
        <StatCard label="Contas sociais" value={`${accountCount} de ${plan.maxAccounts}`} />
        <StatCard label="Resolução" value={plan.maxResolution} />
        <StatCard label="Clips por projeto" value={`${plan.maxClipsPerProject}`} />
      </div>
      <div className="mt-5 rounded-2xl border border-border bg-card p-5">
        <p className="text-[13px] font-medium text-white">Minutos utilizados</p>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full gradient-primary" style={{ width: `${usedMinutesPct}%` }} />
        </div>
        <p className="mt-2 text-[12px] text-muted-foreground">
          {formatNumber(Math.round(usage.usedSeconds))}s de {formatNumber(plan.monthlyMinutes * 60)}s neste período
        </p>
      </div>
      {paid && canManage ? (
        <form action={manageSubscriptionAction} className="mt-4">
          <Button type="submit" variant="outline">
            Gerenciar assinatura
          </Button>
        </form>
      ) : null}
      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        {PRODUCT_PLAN_CODES.map((code) => {
          const item = PLAN_LIMITS[code];
          const current = currentCode === code;
          return (
            <form key={code} action={changePlanAction} className={`rounded-2xl border border-border bg-card p-5 ${current ? "border-magenta/50 bg-magenta/5 glow-primary" : ""}`}>
              <input type="hidden" name="plan" value={code} />
              <p className="text-[13px] font-semibold">{item.name}</p>
              <p className="mt-1 text-[12px] text-muted-foreground">{planPriceLabel(code)}</p>
              <p className="mt-1 text-[12px] text-muted-foreground">
                {item.monthlyMinutes} min / mês · {item.maxResolution} · {item.maxClipsPerProject} clips/projeto
              </p>
              {current ? (
                <Button size="sm" className="mt-3 w-full" type="button" variant="outline" disabled>
                  Plano atual
                </Button>
              ) : !checkoutReady ? (
                <Button size="sm" className="mt-3 w-full" type="button" variant="outline" disabled>
                  Indisponível no momento
                </Button>
              ) : !canManage ? (
                <Button size="sm" className="mt-3 w-full" type="button" variant="outline" disabled>
                  Somente o responsável
                </Button>
              ) : code === "FREE" ? (
                <Button size="sm" className="mt-3 w-full" type="submit" variant="outline">
                  Voltar ao Free no fim do período
                </Button>
              ) : (
                <Button size="sm" className="mt-3 w-full" type="submit">
                  {paid ? "Alterar plano" : "Fazer upgrade"}
                </Button>
              )}
            </form>
          );
        })}
      </div>
      <p className="mt-4 text-[12px]">
        <Link href="/pricing" className="text-primary hover:underline">
          Ver comparação de planos
        </Link>
      </p>
      <PromoRedeemForm endsAt={usage.activeGrant?.source === "PROMO" ? usage.activeGrant.endsAt : null} />
    </div>
  );
}
