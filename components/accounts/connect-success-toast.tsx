"use client";

import { useEffect, useState } from "react";

export function ConnectSuccessToast({ show, accountCount }: { show: boolean; accountCount: number }) {
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!show) return;
    const url = new URL(window.location.href);
    if (!url.searchParams.has("connected") && !url.searchParams.has("connect_status")) return;
    url.searchParams.delete("connected");
    url.searchParams.delete("connect_status");
    const query = url.searchParams.toString();
    window.history.replaceState(null, "", `${url.pathname}${query ? `?${query}` : ""}${url.hash}`);
  }, [show]);

  if (!show || dismissed) return null;

  if (accountCount < 1) {
    return (
      <div className="mb-3 flex items-center justify-between rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[13px] text-amber-100">
        <span>Nenhuma conta social foi encontrada. Conclua a autorização na rede e clique em Atualizar contas.</span>
        <button type="button" className="text-[11px] underline" onClick={() => setDismissed(true)}>
          Fechar
        </button>
      </div>
    );
  }

  return (
    <div className="mb-3 flex items-center justify-between rounded-md border border-emerald-500/40 bg-emerald-500/15 px-3 py-2 text-[13px] text-emerald-100">
      <span>Conta social conectada com sucesso.</span>
      <button type="button" className="text-[11px] underline" onClick={() => setDismissed(true)}>
        Fechar
      </button>
    </div>
  );
}
