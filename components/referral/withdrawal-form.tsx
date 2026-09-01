"use client";

import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MIN_WITHDRAWAL_CENTS, formatBrlFromCents } from "@/lib/referral/config";
import { requestWithdrawalAction } from "@/app/(studio)/studio/referrals/actions";

export function WithdrawalForm({ availableCents }: { availableCents: number }) {
  const [amount, setAmount] = useState(String(availableCents / 100));
  const missing = Math.max(0, MIN_WITHDRAWAL_CENTS - availableCents);
  const disabled = availableCents < MIN_WITHDRAWAL_CENTS;
  const amountCents = Math.round(Number(amount.replace(",", ".")) * 100);
  const validAmount = Number.isFinite(amountCents) && amountCents >= MIN_WITHDRAWAL_CENTS && amountCents <= availableCents;
  const hint = useMemo(() => {
    if (disabled) return `Você precisa de mais ${formatBrlFromCents(missing)} para solicitar um saque.`;
    if (!validAmount) return `O valor deve ser entre ${formatBrlFromCents(MIN_WITHDRAWAL_CENTS)} e ${formatBrlFromCents(availableCents)}.`;
    return "O PIX será pago manualmente pelo administrador. Nenhum pagamento automático.";
  }, [availableCents, disabled, missing, validAmount]);

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button type="button" disabled={disabled} className="gradient-brand text-white disabled:opacity-50">
          Solicitar saque
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Solicitar saque</DialogTitle>
          <DialogDescription>{hint}</DialogDescription>
        </DialogHeader>
        <form action={requestWithdrawalAction} className="space-y-3">
          <div>
            <Label htmlFor="amount">Valor do saque</Label>
            <Input
              id="amount"
              name="amount"
              type="number"
              min={MIN_WITHDRAWAL_CENTS / 100}
              max={availableCents / 100}
              step="0.01"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              required
            />
          </div>
          <div>
            <Label htmlFor="pixKeyType">Tipo de chave PIX</Label>
            <select id="pixKeyType" name="pixKeyType" required className="mt-1 h-9 w-full rounded-md border bg-transparent px-2 text-[13px]">
              <option value="CPF">CPF</option>
              <option value="CNPJ">CNPJ</option>
              <option value="EMAIL">E-mail</option>
              <option value="PHONE">Telefone</option>
              <option value="EVP">Chave aleatória</option>
            </select>
          </div>
          <div>
            <Label htmlFor="pixKey">Chave PIX</Label>
            <Input id="pixKey" name="pixKey" required autoComplete="off" />
          </div>
          <div>
            <Label htmlFor="holderName">Nome do titular</Label>
            <Input id="holderName" name="holderName" required autoComplete="name" />
          </div>
          <div>
            <Label htmlFor="holderDocument">CPF do titular (opcional)</Label>
            <Input id="holderDocument" name="holderDocument" autoComplete="off" />
          </div>
          <Button type="submit" className="w-full gradient-brand text-white" disabled={!validAmount}>
            Confirmar solicitação
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
