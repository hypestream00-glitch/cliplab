"use client";

import Link from "next/link";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { formatBrlFromCents } from "@/lib/referral/config";

export type ReferralModalProps = {
  url: string;
  invited: number;
  converted: number;
  availableCents: number;
  pendingCents: number;
};

export function ReferralButton({ url, invited, converted, availableCents, pendingCents }: ReferralModalProps) {
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
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>🎁 Indique e ganhe</DialogTitle>
          <DialogDescription>
            Convide amigos para o CortaClip e ganhe recompensas quando eles se tornarem assinantes. A primeira assinatura paga válida libera R$5 de saldo e +30 minutos de processamento. Cadastro, trial e pagamentos falhos não geram recompensa.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/10 px-3 py-3">
            <p className="text-[20px] font-semibold text-yellow-300">💰 R$5</p>
            <p className="mt-1 text-[12px] text-muted-foreground">Saldo sacável</p>
          </div>
          <div className="rounded-xl border border-violet-500/30 bg-violet-500/10 px-3 py-3">
            <p className="text-[20px] font-semibold text-violet-200">⚡ +30 min</p>
            <p className="mt-1 text-[12px] text-muted-foreground">Processamento com IA</p>
          </div>
        </div>
        <div>
          <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Seu link</p>
          <p className="mt-1 break-all rounded-md border bg-muted/40 px-2 py-2 font-mono text-[12px]">{url}</p>
          <Button type="button" className="mt-3 w-full gradient-brand text-white" onClick={() => void copyLink()}>
            Copiar meu link
          </Button>
        </div>
        <dl className="grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
          <div className="rounded-lg border bg-card px-2 py-2">
            <dt className="text-[10px] text-muted-foreground">Amigos indicados</dt>
            <dd className="mt-1 text-[16px] font-semibold">{invited}</dd>
          </div>
          <div className="rounded-lg border bg-card px-2 py-2">
            <dt className="text-[10px] text-muted-foreground">Assinaturas confirmadas</dt>
            <dd className="mt-1 text-[16px] font-semibold">{converted}</dd>
          </div>
          <div className="rounded-lg border bg-card px-2 py-2">
            <dt className="text-[10px] text-muted-foreground">Saldo disponível</dt>
            <dd className="mt-1 text-[16px] font-semibold">{formatBrlFromCents(availableCents)}</dd>
          </div>
          <div className="rounded-lg border bg-card px-2 py-2">
            <dt className="text-[10px] text-muted-foreground">Saldo pendente</dt>
            <dd className="mt-1 text-[16px] font-semibold">{formatBrlFromCents(pendingCents)}</dd>
          </div>
        </dl>
        <Button asChild variant="outline" className="w-full">
          <Link href="/studio/referrals">Ver minha carteira</Link>
        </Button>
      </DialogContent>
    </Dialog>
  );
}
