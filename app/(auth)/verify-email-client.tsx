"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { resendVerificationAction } from "@/app/(auth)/actions";

export function VerifyEmailClient({
  masked,
  expired = false,
  token = "",
}: {
  masked: string | null;
  expired?: boolean;
  token?: string;
}) {
  const [state, action, pending] = useActionState(resendVerificationAction, null);
  return (
    <form action={action} className="space-y-3">
      {token ? <input type="hidden" name="token" value={token} /> : null}
      {state && "error" in state && state.error ? (
        <p className="text-[13px] text-destructive">{state.error}</p>
      ) : null}
      {state && "ok" in state ? (
        <p className="text-[13px] text-muted-foreground">
          {masked ? `Se ainda precisar, enviamos outro link para ${masked}.` : "Se a conta existir, enviamos um novo link."}
        </p>
      ) : null}
      <Button type="submit" className="h-11 w-full" disabled={pending} variant={expired ? "default" : "outline"}>
        {pending ? "Enviando..." : "Reenviar e-mail"}
      </Button>
    </form>
  );
}
