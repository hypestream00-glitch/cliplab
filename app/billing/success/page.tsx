import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Checkout confirmado" };

export default async function BillingSuccessPage() {
  await requireUser();
  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-4">
      <h1 className="text-2xl font-semibold tracking-tight">Estamos confirmando seu pagamento</h1>
      <p className="mt-3 text-[14px] text-muted-foreground">
        Abrir esta página não ativa o plano. A assinatura só muda depois que o Stripe confirmar o evento no webhook.
      </p>
      <Button asChild className="mt-6 w-fit">
        <Link href="/studio/settings/billing">Voltar ao billing</Link>
      </Button>
    </main>
  );
}
