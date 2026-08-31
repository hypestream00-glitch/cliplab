import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { changePasswordAction } from "@/app/(studio)/studio/settings/actions";

const ERRORS: Record<string, string> = {
  invalid: "A nova senha precisa ter 8 caracteres, letra e número, e as confirmações devem coincidir.",
  current: "A senha atual não confere.",
  oauth: "Esta conta não usa senha CLIPLAB.",
};

export function ChangePasswordForm({
  redirectTo,
  error,
  saved,
}: {
  redirectTo: string;
  error?: string;
  saved?: boolean;
}) {
  return (
    <form action={changePasswordAction} className="max-w-md space-y-3 rounded-xl border p-4">
      <input type="hidden" name="redirectTo" value={redirectTo} />
      <p className="text-[13px] font-medium">Alterar senha</p>
      <p className="text-[12px] text-muted-foreground">Use a senha da conta CLIPLAB. Nunca a senha de uma rede social.</p>
      {saved ? <p className="text-[12px] text-emerald-300">Senha atualizada. Outras sessões foram encerradas.</p> : null}
      {error && ERRORS[error] ? <p className="text-[12px] text-destructive">{ERRORS[error]}</p> : null}
      <div className="space-y-1.5">
        <Label htmlFor="currentPassword">Senha atual</Label>
        <Input id="currentPassword" name="currentPassword" type="password" required autoComplete="current-password" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="password">Nova senha</Label>
        <Input id="password" name="password" type="password" minLength={8} required autoComplete="new-password" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="confirmPassword">Confirmar nova senha</Label>
        <Input id="confirmPassword" name="confirmPassword" type="password" minLength={8} required autoComplete="new-password" />
      </div>
      <Button type="submit">Atualizar senha</Button>
    </form>
  );
}
