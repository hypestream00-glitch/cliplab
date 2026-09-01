"use client";

import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export type ReferralModalProps = {
  url: string;
  invited: number;
  converted: number;
  rewardDays: number;
};

export function ReferralButton({ url, invited, converted, rewardDays }: ReferralModalProps) {
  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link de indicação copiado!");
    } catch {
      toast.error("Não foi possível copiar o link.");
    }
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className="h-9 gap-1.5 rounded-xl border-gold/55 bg-black px-3.5 text-[13px] font-semibold text-yellow-300 glow-promo hover:bg-gold/10 hover:text-yellow-200"
          aria-label="Indique e ganhe"
        >
          <span aria-hidden>🎁</span>
          <span className="hidden sm:inline">Indique e ganhe</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>🎁 Ganhe Pro indicando amigos</DialogTitle>
          <DialogDescription>
            Compartilhe seu link exclusivo. Quando um amigo fizer a primeira assinatura paga, você recebe 7 dias de Pro grátis. O amigo pode usar os cupons disponíveis no CortaClip normalmente.
          </DialogDescription>
        </DialogHeader>
        <div>
          <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Seu link</p>
          <p className="mt-1 break-all rounded-md border bg-muted/40 px-2 py-2 font-mono text-[12px]">{url}</p>
          <Button type="button" className="mt-3 w-full gradient-brand text-white" onClick={() => void copyLink()}>
            Copiar meu link
          </Button>
        </div>
        <dl className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-lg border bg-card px-2 py-2">
            <dt className="text-[10px] text-muted-foreground">Amigos indicados</dt>
            <dd className="mt-1 text-[16px] font-semibold">{invited}</dd>
          </div>
          <div className="rounded-lg border bg-card px-2 py-2">
            <dt className="text-[10px] text-muted-foreground">Assinaturas confirmadas</dt>
            <dd className="mt-1 text-[16px] font-semibold">{converted}</dd>
          </div>
          <div className="rounded-lg border bg-card px-2 py-2">
            <dt className="text-[10px] text-muted-foreground">Recompensas recebidas</dt>
            <dd className="mt-1 text-[16px] font-semibold">{rewardDays} dias</dd>
          </div>
        </dl>
      </DialogContent>
    </Dialog>
  );
}
