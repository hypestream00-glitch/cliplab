import Link from "next/link";
import { auth } from "@/lib/auth";
import { brand } from "@/lib/config/brand";
import { Button } from "@/components/ui/button";
import { PRODUCT_PLAN_CODES, PLAN_LIMITS, productPlanCode } from "@/lib/config/plans";
import { planPriceLabel } from "@/lib/config/plan-commerce";
import { isBillingCheckoutEnabled } from "@/lib/billing/provider";
import { prisma } from "@/lib/db/prisma";

export const metadata = { title: "Planos" };

export default async function PricingPage() {
  const session = await auth();
  const checkoutReady = isBillingCheckoutEnabled();
  let current: string | null = null;
  if (session?.user?.id) {
    const membership = await prisma.workspaceMember.findFirst({
      where: { userId: session.user.id },
      include: { workspace: { include: { subscription: { include: { plan: true } } } } },
      orderBy: { createdAt: "asc" },
    });
    current = membership?.workspace.subscription?.plan.code ?? "FREE";
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-16">
        <h1 className="text-center text-3xl font-semibold tracking-tight">Planos {brand.name}</h1>
        <p className="mx-auto mt-2 max-w-lg text-center text-[14px] text-muted-foreground">
          Compare minutos, contas sociais e qualidade de exportação. O plano só muda depois da confirmação do pagamento.
        </p>
        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {PRODUCT_PLAN_CODES.map((code) => {
            const plan = PLAN_LIMITS[code];
            const pricingLabel = planPriceLabel(code);
            const isCurrent = current ? productPlanCode(current) === code : false;
            return (
              <article key={code} className="rounded-2xl border bg-card p-5">
                <p className="text-[15px] font-semibold">{plan.name}</p>
                <p className="mt-1 text-[13px] text-muted-foreground">{pricingLabel}</p>
                <ul className="mt-4 space-y-1.5 text-[13px] text-muted-foreground">
                  <li>{plan.monthlyMinutes} minutos de processamento / mês</li>
                  <li>Exportação até {plan.maxResolution}</li>
                  <li>{plan.maxClipsPerProject} clips por projeto</li>
                  <li>{plan.maxAccounts === 1 ? "1 conta social" : `${plan.maxAccounts} contas sociais`}</li>
                  {plan.priority ? <li>Prioridade de processamento</li> : null}
                </ul>
                {isCurrent ? (
                  <Button className="mt-6 w-full" variant="outline" disabled>
                    Plano atual
                  </Button>
                ) : code === "FREE" ? (
                  <Button asChild className="mt-6 w-full">
                    <Link href={session ? "/studio/settings/billing" : "/register"}>Começar</Link>
                  </Button>
                ) : checkoutReady && session ? (
                  <Button asChild className="mt-6 w-full">
                    <Link href="/studio/settings/billing">Fazer upgrade</Link>
                  </Button>
                ) : (
                  <Button asChild className="mt-6 w-full" variant="outline">
                    <Link href={session ? "/studio/settings/billing?payments=configuring" : "/register"}>
                      Pagamentos em configuração
                    </Link>
                  </Button>
                )}
              </article>
            );
          })}
        </div>
    </main>
  );
}
