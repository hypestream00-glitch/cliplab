import Link from "next/link";
import { Gauge } from "lucide-react";
import { cn } from "@/lib/utils";

export function CreditsWidget({
  collapsed,
  planName,
  usageLabel,
  usagePercent = 0,
  grantLabel,
}: {
  collapsed: boolean;
  credits?: number | null;
  planName: string;
  usageLabel?: string;
  usagePercent?: number;
  grantLabel?: string | null;
}) {
  const pct = Math.min(100, Math.max(0, usagePercent));
  return (
    <Link
      href="/studio/settings/billing"
      className={cn(
        "block rounded-xl border border-sidebar-border bg-card/40 px-2.5 py-2.5 hover:bg-sidebar-accent/50",
        collapsed && "px-1.5",
      )}
    >
      <div className={cn("flex items-center gap-2", collapsed && "justify-center")}>
        <Gauge className="size-4 text-primary" />
        {!collapsed && <p className="text-[11px] font-medium text-muted-foreground">Plano atual</p>}
      </div>
      {!collapsed && (
        <>
          <div className="mt-1 flex items-center gap-1.5">
            <p className="text-[13px] font-semibold">{planName}</p>
            {grantLabel ? (
              <span className="rounded-md border border-yellow-500/30 bg-yellow-500/10 px-1.5 py-0.5 text-[10px] text-yellow-300">
                🎁 Benefício ativo
              </span>
            ) : null}
          </div>
          {grantLabel ? <p className="mt-0.5 text-[11px] text-yellow-400/90">{grantLabel}</p> : null}
          <p className="mt-1 text-[11px] text-muted-foreground">{usageLabel ?? "Uso do plano"}</p>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full gradient-brand" style={{ width: `${pct}%` }} />
          </div>
          <p className="mt-2 text-[11px] font-medium text-primary">Gerenciar plano</p>
        </>
      )}
    </Link>
  );
}
