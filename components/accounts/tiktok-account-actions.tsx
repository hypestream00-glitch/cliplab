"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { disconnectSocialAction } from "@/app/(studio)/studio/accounts/actions";

export function DisconnectAccountButton({ accountId }: { accountId: string }) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <Button size="sm" variant="ghost" type="button" onClick={() => setOpen(true)}>
        Desconectar
      </Button>
    );
  }
  return (
    <form action={disconnectSocialAction} className="flex items-center gap-1">
      <input type="hidden" name="accountId" value={accountId} />
      <Button size="sm" variant="destructive" type="submit">
        Confirmar
      </Button>
      <Button size="sm" variant="ghost" type="button" onClick={() => setOpen(false)}>
        Cancelar
      </Button>
    </form>
  );
}

export function TikTokConfigNotice() {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <Button size="sm" variant="outline" type="button" onClick={() => setOpen((value) => !value)}>
        Conectar
      </Button>
      {open ? (
        <div className="mt-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-[11px] text-amber-100">
          TikTok: configuração necessária. Defina TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET e TIKTOK_REDIRECT_URI no servidor.
          CLIPLAB não simula OAuth e não pede senha/cookie do TikTok. Veja docs/TIKTOK-INTEGRATION.md.
        </div>
      ) : null}
    </div>
  );
}

export function YouTubeConfigNotice() {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <Button size="sm" variant="outline" type="button" onClick={() => setOpen((value) => !value)}>
        Conectar YouTube
      </Button>
      {open ? (
        <div className="mt-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-[11px] text-amber-100">
          YouTube: configuração necessária. Defina GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET (ou AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET)
          no servidor. CLIPLAB não pede senha Google nem usa scraping. Veja docs/YOUTUBE-INTEGRATION.md.
        </div>
      ) : null}
    </div>
  );
}

export function XConfigNotice() {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <Button size="sm" variant="outline" type="button" onClick={() => setOpen((value) => !value)}>
        Conectar X
      </Button>
      {open ? (
        <div className="mt-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-[11px] text-amber-100">
          X: configuração necessária. Defina X_CLIENT_ID, X_CLIENT_SECRET e X_REDIRECT_URI no servidor. Publicação exige
          plano Basic/Pro/Enterprise da API. CLIPLAB não finge OAuth. Veja docs/X-INTEGRATION.md.
        </div>
      ) : null}
    </div>
  );
}

export function MetaConfigNotice({ platform }: { platform: "INSTAGRAM" | "FACEBOOK" }) {
  const [open, setOpen] = useState(false);
  const label = platform === "INSTAGRAM" ? "Instagram" : "Facebook";
  return (
    <div>
      <Button size="sm" variant="outline" type="button" onClick={() => setOpen((value) => !value)}>
        Conectar {label}
      </Button>
      {open ? (
        <div className="mt-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-[11px] text-amber-100">
          {label} — Configuração necessária. Defina META_APP_ID e META_APP_SECRET no servidor. CLIPLAB não pede senha,
          cookie nem token manual. Veja docs/META-INTEGRATION.md.
        </div>
      ) : null}
    </div>
  );
}
