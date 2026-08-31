"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { forgotPasswordAction } from "@/app/(auth)/actions";

export default function ForgotPasswordPage() {
  const [state, action, pending] = useActionState(forgotPasswordAction, null);
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <form action={action} className="w-full max-w-[400px] space-y-3">
        <h1 className="text-[22px] font-semibold tracking-tight">Esqueci minha senha</h1>
        <p className="text-[14px] text-muted-foreground">
          Informe o e-mail da conta. Se ele existir, enviaremos as instruções.
        </p>
        <div className="space-y-1.5">
          <Label htmlFor="email">E-mail</Label>
          <Input id="email" name="email" type="email" required autoComplete="email" className="h-11" />
        </div>
        {state && "error" in state && state.error ? <p className="text-[13px] text-destructive">{state.error}</p> : null}
        {state && "ok" in state ? (
          <p className="text-[13px] text-muted-foreground">
            Se existir uma conta com esse e-mail, enviaremos as instruções.
          </p>
        ) : null}
        <Button type="submit" className="h-11 w-full" disabled={pending}>
          {pending ? "Enviando..." : "Enviar instruções"}
        </Button>
        <p className="text-center text-[13px]">
          <Link href="/login" className="text-muted-foreground hover:text-foreground">
            Voltar ao login
          </Link>
        </p>
      </form>
    </div>
  );
}
