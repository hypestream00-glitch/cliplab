import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export function DataBadge({
  kind,
  className,
}: {
  kind: "DEMO" | "MOCK" | "CONFIG" | "REAL";
  className?: string;
}) {
  const label =
    kind === "DEMO" ? "DEMO" : kind === "MOCK" ? "MOCK" : kind === "CONFIG" ? "CONFIGURAÇÃO NECESSÁRIA" : "REAL";
  return (
    <Badge
      variant="outline"
      className={cn(
        "h-5 rounded-md px-1.5 text-[10px] font-semibold tracking-wide",
        kind === "DEMO" && "border-amber-500/50 text-amber-200",
        kind === "MOCK" && "border-amber-500/50 text-amber-200",
        kind === "CONFIG" && "border-amber-500/50 text-amber-200",
        kind === "REAL" && "border-emerald-500/40 text-emerald-300",
        className,
      )}
    >
      {label}
    </Badge>
  );
}
