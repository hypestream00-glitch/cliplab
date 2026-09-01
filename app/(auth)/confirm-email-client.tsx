"use client";

import { useActionState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { confirmEmailVerificationAction } from "@/app/(auth)/actions";

export function ConfirmEmailClient({ token }: { token: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  const submitted = useRef(false);
  const [state, action, pending] = useActionState(confirmEmailVerificationAction, null);

  useEffect(() => {
    if (submitted.current || pending) return;
    submitted.current = true;
    formRef.current?.requestSubmit();
  }, [pending]);

  return (
    <form ref={formRef} action={action} className="space-y-3">
      <input type="hidden" name="token" value={token} />
      {state && "error" in state && state.error ? (
        <p className="text-[13px] text-destructive">{state.error}</p>
      ) : null}
      <Button type="submit" className="h-11 w-full" disabled={pending}>
        {pending ? "Confirmando..." : "Confirmar e-mail"}
      </Button>
    </form>
  );
}
