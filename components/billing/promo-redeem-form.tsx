"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { redeemPromoAction } from "@/app/(studio)/studio/settings/billing/actions";
import { format } from "date-fns";

export function PromoRedeemForm({ endsAt }: { endsAt?: Date | null }) {
  const [state, action, pending] = useActionState(redeemPromoAction, null);
  const appliedUntil = state && "endsAt" in state && state.endsAt ? new Date(state.endsAt) : endsAt;
  return (
    <form action={action} className="mt-4 rounded-2xl border bg-card p-4">
      <Label htmlFor="promo-code">Cupom ou código promocional</Label>
      <div className="mt-2 flex flex-col gap-2 sm:flex-row">
        <Input
          id="promo-code"
          name="code"
          placeholder="Digite seu código"
          autoComplete="off"
          className="h-10 font-mono uppercase"
          aria-label="Código promocional"
        />
        <Button type="submit" className="h-10 sm:w-32" disabled={pending}>
          {pending ? "Aplicando..." : "Aplicar"}
        </Button>
      </div>
      {state && "error" in state && state.error ? <p className="mt-2 text-[13px] text-destructive">{state.error}</p> : null}
      {state && "ok" in state && state.ok ? (
        <p className="mt-2 text-[13px] text-emerald-300">
          ✓ Cupom aplicado! Você ganhou 3 dias grátis no CortaClip.
        </p>
      ) : null}
      {appliedUntil ? (
        <p className="mt-2 text-[12px] text-muted-foreground">
          Benefício ativo até: {format(appliedUntil, "dd/MM/yyyy")}
        </p>
      ) : null}
    </form>
  );
}
