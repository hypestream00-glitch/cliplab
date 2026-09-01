"use client";

import { useActionState } from "react";
import Link from "next/link";
import { brand } from "@/lib/config/brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { registerAction } from "@/app/(auth)/actions";

export function RegisterForm({ referralCode }: { referralCode?: string }) {
  const [state, action, pending] = useActionState(registerAction, null);
  return (
    <div className="mx-auto w-full max-w-[400px]">
      <div className="mb-6 text-center">
        <p className="text-[13px] font-semibold">{brand.name}</p>
        <h1 className="mt-2 text-[22px] font-semibold">Criar conta</h1>
        <p className="mt-1 text-[13px] text-muted-foreground">Comece com um workspace pessoal.</p>
      </div>
      <form action={action} className="space-y-3">
        {referralCode ? <input type="hidden" name="ref" value={referralCode} /> : null}
        <div className="space-y-1.5">
          <Label htmlFor="name">Nome</Label>
          <Input id="name" name="name" required autoComplete="name" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="email">E-mail</Label>
          <Input id="email" name="email" type="email" required autoComplete="email" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="password">Senha</Label>
          <Input id="password" name="password" type="password" required autoComplete="new-password" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="confirmPassword">Confirmar senha</Label>
          <Input id="confirmPassword" name="confirmPassword" type="password" required autoComplete="new-password" />
        </div>
        <label className="flex items-start gap-2 text-[13px]">
          <input type="checkbox" name="terms" required className="mt-0.5 size-3.5 accent-primary" />
          <span>
            Li e aceito os{" "}
            <Link href="/terms" className="underline">
              Termos de Uso
            </Link>{" "}
            e a{" "}
            <Link href="/privacy" className="underline">
              Política de Privacidade
            </Link>
            .
          </span>
        </label>
        {state && "error" in state && state.error ? (
          <p className="text-[12px] text-destructive">{state.error}</p>
        ) : null}
        <Button type="submit" className="h-11 w-full" disabled={pending}>
          {pending ? "Criando..." : "Criar conta"}
        </Button>
      </form>
      <p className="mt-4 text-center text-[12px] text-muted-foreground">
        Já tem conta?{" "}
        <Link href="/login" className="text-foreground hover:underline">
          Entrar
        </Link>
      </p>
    </div>
  );
}
