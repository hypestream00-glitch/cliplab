"use client";

import { useActionState } from "react";
import { createApiKeyAction, revokeApiKeyAction } from "@/app/(studio)/studio/api/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DevNotice } from "@/components/dashboard/dev-notice";
import { formatDateTime } from "@/lib/utils/format";

type KeyRow = {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  createdAt: string;
  lastUsedAt: string | null;
};

export function ApiKeysManager({ keys }: { keys: KeyRow[] }) {
  const [state, action, pending] = useActionState(createApiKeyAction, null);

  return (
    <div className="space-y-4">
      <form action={action} className="space-y-3 rounded-xl border bg-card p-4">
        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <Input name="name" required placeholder="Nome da chave" />
          <Button type="submit" disabled={pending}>
            {pending ? "Criando..." : "Criar chave"}
          </Button>
        </div>
        <div className="flex flex-wrap gap-3 text-[12px]">
          {["clips:read", "projects:write", "publish:write"].map((scope) => (
            <label key={scope} className="flex items-center gap-1.5">
              <input type="checkbox" name="scopes" value={scope} defaultChecked className="size-3.5 accent-primary" />
              {scope}
            </label>
          ))}
        </div>
        {state?.error ? <p className="text-[12px] text-destructive">{state.error}</p> : null}
        {state?.secret ? (
          <DevNotice>
            Copie agora — o secret não será mostrado de novo: <span className="font-mono text-foreground">{state.secret}</span>
          </DevNotice>
        ) : null}
      </form>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-left text-[13px]">
          <thead className="border-b text-[11px] text-muted-foreground uppercase">
            <tr>
              <th className="px-3 py-2">Nome</th>
              <th className="px-3 py-2">Prefixo</th>
              <th className="px-3 py-2">Scopes</th>
              <th className="px-3 py-2">Criada</th>
              <th className="px-3 py-2">Ações</th>
            </tr>
          </thead>
          <tbody>
            {keys.length === 0 ? (
              <tr>
                <td className="px-3 py-6 text-muted-foreground" colSpan={5}>
                  Nenhuma chave ativa.
                </td>
              </tr>
            ) : (
              keys.map((key) => (
                <tr key={key.id} className="border-b last:border-0">
                  <td className="px-3 py-2">{key.name}</td>
                  <td className="px-3 py-2 font-mono">{key.prefix}…</td>
                  <td className="px-3 py-2">{key.scopes.join(", ")}</td>
                  <td className="px-3 py-2">{formatDateTime(key.createdAt)}</td>
                  <td className="px-3 py-2">
                    <form action={revokeApiKeyAction}>
                      <input type="hidden" name="keyId" value={key.id} />
                      <Button size="sm" variant="ghost" type="submit">
                        Revogar
                      </Button>
                    </form>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
