import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Checkout cancelado" };

export default async function BillingCancelPage() {
  await requireUser();
  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-4">
      <h1 className="text-2xl font-semibold tracking-tight">Checkout cancelado</h1>
      <p className="mt-3 text-[14px] text-muted-foreground">
        Nenhuma cobrança foi feita. Seu plano atual permanece o mesmo.
      </p>
      <Button asChild className="mt-6 w-fit">
        <Link href="/studio/settings/billing">Voltar ao billing</Link>
      </Button>
    </main>
  );
}
