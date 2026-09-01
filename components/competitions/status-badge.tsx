import { cn } from "@/lib/utils";
import { statusLabel } from "@/lib/ui/status-labels";

const TONE: Record<string, string> = {
  DRAFT: "bg-muted text-muted-foreground",
  SCHEDULED: "bg-yellow-500/15 text-yellow-300",
  ACTIVE: "bg-emerald-500/15 text-emerald-300",
  FINALIZING: "bg-yellow-500/15 text-yellow-300",
  FINISHED: "bg-violet-500/15 text-violet-300",
  CANCELLED: "bg-red-500/15 text-red-300",
  PENDING: "bg-yellow-500/15 text-yellow-300",
  VERIFIED: "bg-emerald-500/15 text-emerald-300",
  REJECTED: "bg-red-500/15 text-red-300",
  REMOVED: "bg-red-500/15 text-red-300",
  FLAGGED: "bg-amber-500/15 text-amber-200",
};

const LABELS: Record<string, string> = {
  DRAFT: "Rascunho",
  SCHEDULED: "Agendado",
  ACTIVE: "Ativo",
  FINALIZING: "Encerrando",
  FINISHED: "Finalizado",
  CANCELLED: "Cancelado",
  PENDING: "Em análise",
  VERIFIED: "Verificado",
  REJECTED: "Inválido",
  REMOVED: "Removido",
  FLAGGED: "Em revisão",
};

export function CompetitionStatusBadge({ status }: { status: string }) {
  return (
    <span className={cn("inline-flex h-5 items-center rounded-md px-1.5 text-[11px] font-medium", TONE[status] ?? "bg-muted text-muted-foreground")}>
      {LABELS[status] ?? statusLabel(status)}
    </span>
  );
}
