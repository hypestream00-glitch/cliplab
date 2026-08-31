"use client";

import { useActionState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { resetPasswordAction } from "@/app/(auth)/actions";

function ResetForm() {
  const params = useSearchParams();
  const [state, action, pending] = useActionState(resetPasswordAction, null);
  const token = params.get("token") ?? "";
  if (!token) {
    return (
      <div className="w-full max-w-[400px] space-y-3 text-center">
        <h1 className="text-[22px] font-semibold tracking-tight">Link expirado</h1>
        <p className="text-[14px] text-muted-foreground">Este link de redefinição não é válido. Solicite um novo.</p>
        <Link href="/forgot-password" className="text-[13px] text-primary hover:underline">
          Esqueci minha senha
        </Link>
      </div>
    );
  }
  return (
    <form action={action} className="w-full max-w-[400px] space-y-3">
      <h1 className="text-[22px] font-semibold tracking-tight">Redefinir senha</h1>
      <p className="text-[14px] text-muted-foreground">Escolha uma senha nova para a sua conta.</p>
      <input type="hidden" name="token" value={token} />
      <div className="space-y-1.5">
        <Label htmlFor="password">Nova senha</Label>
        <Input id="password" name="password" type="password" required autoComplete="new-password" minLength={8} className="h-11" />
      </div>
      {state && "error" in state && state.error ? <p className="text-[13px] text-destructive">{state.error}</p> : null}
      <Button type="submit" className="h-11 w-full" disabled={pending}>
        {pending ? "Salvando..." : "Salvar nova senha"}
      </Button>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <Suspense>
        <ResetForm />
      </Suspense>
    </div>
  );
}
