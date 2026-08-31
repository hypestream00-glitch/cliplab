"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { googleLoginAction, loginAction } from "@/app/(auth)/actions";

export function LoginForm({ googleEnabled }: { googleEnabled: boolean }) {
  const [state, action, pending] = useActionState(loginAction, null);
  return (
    <div className="w-full">
      {googleEnabled ? (
        <form action={googleLoginAction} className="mb-4">
          <Button type="submit" variant="secondary" className="h-11 w-full bg-white text-black hover:bg-white/90">
            Continuar com Google
          </Button>
        </form>
      ) : null}
      <form action={action} className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="email">E-mail</Label>
          <Input id="email" name="email" type="email" required autoComplete="email" placeholder="seu@email.com" className="h-11" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="password">Senha</Label>
          <Input id="password" name="password" type="password" required autoComplete="current-password" className="h-11" />
        </div>
        {state && "error" in state && state.error ? (
          <p className="text-[12px] text-destructive">{state.error}</p>
        ) : null}
        <Button type="submit" className="h-11 w-full" disabled={pending}>
          {pending ? "Entrando..." : "Entrar"}
        </Button>
      </form>
      <div className="mt-4 flex flex-col items-center gap-2 text-[13px]">
        <Link href="/forgot-password" className="text-muted-foreground hover:text-foreground">
          Esqueci minha senha
        </Link>
        <p className="text-muted-foreground">
          Não tem conta?{" "}
          <Link href="/register" className="font-medium text-primary hover:underline">
            Criar conta
          </Link>
        </p>
      </div>
    </div>
  );
}
