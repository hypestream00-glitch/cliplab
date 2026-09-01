import Link from "next/link";
import { Zap } from "lucide-react";
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
        "block rounded-2xl border border-sidebar-border bg-surface px-3.5 py-3.5 hover:bg-surface-hover",
        collapsed && "px-2",
      )}
    >
      <div className={cn("flex items-center gap-2", collapsed && "justify-center")}>
        <Zap className="size-4 text-blue" />
        {!collapsed && <p className="text-[12px] font-medium text-text-secondary">Plano atual</p>}
      </div>
      {!collapsed && (
        <>
          <div className="mt-1.5 flex items-center gap-1.5">
            <p className="text-[15px] font-semibold text-white">{planName}</p>
            {grantLabel ? (
              <span className="rounded-md border border-gold/30 bg-gold/10 px-1.5 py-0.5 text-[10px] text-yellow-300">
                🎁 Benefício ativo
              </span>
            ) : null}
          </div>
          {grantLabel ? <p className="mt-0.5 text-[11px] text-gold">{grantLabel}</p> : null}
          <p className="mt-1.5 text-[12px] text-text-secondary">{usageLabel ?? "Uso do plano"}</p>
          <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full gradient-primary" style={{ width: `${pct}%` }} />
          </div>
          <p className="mt-2.5 text-[12px] font-medium text-blue">Gerenciar plano</p>
        </>
      )}
    </Link>
  );
}
