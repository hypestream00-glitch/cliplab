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
        className="mx-auto flex size-9 items-center justify-center rounded-lg border border-yellow-500/40 bg-black text-yellow-400 glow-promo"
        aria-label="Copiar cupom MUGAO12"
      >
        <Tag className="size-4" />
      </button>
    );
  }

  return (
    <div className={cn("rounded-xl border border-yellow-500/40 bg-black p-3 glow-promo")}>
      <p className="flex items-center gap-1.5 text-[10px] font-semibold tracking-[0.14em] text-yellow-400 uppercase">
        <Tag className="size-3.5" />
        Cupom de desconto
      </p>
      <p className="mt-1.5 text-[14px] font-semibold text-white">3 dias grátis</p>
      <p className="mt-0.5 text-[11px] leading-4 text-zinc-400">Use o código abaixo e ganhe 3 dias grátis.</p>
      <div className="mt-2 flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => void copyCode()}
          className="flex h-8 flex-1 items-center justify-between rounded-md border border-yellow-500/30 bg-zinc-950 px-2 font-mono text-[13px] font-semibold tracking-wide text-yellow-300"
          aria-label="Copiar cupom MUGAO12"
        >
          {PUBLIC_PROMO_CODE}
          <Copy className="size-3.5" />
        </button>
      </div>
      <button
        type="button"
        className="mt-2 text-[11px] text-yellow-500/90 underline-offset-2 hover:underline"
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
