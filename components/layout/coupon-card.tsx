"use client";

import { useState } from "react";
import { Copy, Tag } from "lucide-react";
import { toast } from "sonner";
import { PUBLIC_PROMO_CODE } from "@/lib/promo/catalog";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function CouponCard({ collapsed }: { collapsed: boolean }) {
  const [open, setOpen] = useState(false);

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(PUBLIC_PROMO_CODE);
      toast.success("Cupom MUGAO12 copiado!");
    } catch {
      toast.error("Não foi possível copiar o cupom.");
    }
  }

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={() => void copyCode()}
        className="mx-auto flex size-10 items-center justify-center rounded-xl border border-gold/40 bg-black text-gold glow-promo"
        aria-label="Copiar cupom MUGAO12"
      >
        <Tag className="size-4" />
      </button>
    );
  }

  return (
    <div className={cn("rounded-2xl border border-gold/50 bg-[rgba(234,179,8,0.07)] p-4 glow-promo")}>
      <p className="text-[10px] font-semibold tracking-[0.18em] text-gold uppercase">
        🏷 Cupom de desconto
      </p>
      <p className="mt-2 text-[16px] font-semibold text-white">3 dias grátis</p>
      <p className="mt-1.5 text-[12px] leading-5 text-zinc-400">
        Use o código abaixo e ganhe 3 dias grátis no plano Free!
      </p>
      <div className="mt-3 flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => void copyCode()}
          className="flex h-10 flex-1 items-center justify-between rounded-lg border border-gold/40 bg-black px-3 font-mono text-[13px] font-semibold tracking-wide text-yellow-300"
          aria-label="Copiar cupom MUGAO12"
        >
          {PUBLIC_PROMO_CODE}
          <Copy className="size-3.5 text-gold" />
        </button>
      </div>
      <button
        type="button"
        className="mt-2.5 text-[12px] text-gold underline-offset-2 hover:underline"
        onClick={() => setOpen(true)}
      >
        Como usar?
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md" aria-describedby="promo-howto">
          <DialogHeader>
            <DialogTitle>Como usar o cupom MUGAO12</DialogTitle>
            <DialogDescription id="promo-howto">
              Abra Plano e uso, cole MUGAO12 em “Cupom ou código promocional” e clique em Aplicar. Cada conta pode usar este cupom uma vez. O benefício de 3 dias grátis fica registrado na sua conta até a data de expiração.
            </DialogDescription>
          </DialogHeader>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            Entendi
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
