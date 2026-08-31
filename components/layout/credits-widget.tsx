import Link from "next/link";
import { Gauge } from "lucide-react";
import { cn } from "@/lib/utils";

export function CreditsWidget({
  collapsed,
  credits,
  planName,
  usageLabel,
}: {
  collapsed: boolean;
  credits: number | null;
  planName: string;
  usageLabel?: string;
}) {
  return (
    <Link
      href="/studio/settings/billing"
      className={cn(
        "flex items-center gap-2 rounded-md px-2 py-2 text-[12px] hover:bg-sidebar-accent",
        collapsed && "justify-center px-0",
      )}
    >
      <Gauge className="size-4 text-muted-foreground" />
      {!collapsed && (
        <div className="min-w-0">
          <p className="font-medium text-foreground">{usageLabel ?? "Uso do plano"}</p>
          <p className="text-muted-foreground">Plano {planName}{credits != null ? "" : ""}</p>
        </div>
      )}
    </Link>
  );
}
