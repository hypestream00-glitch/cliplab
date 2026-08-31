import Link from "next/link";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { statusLabel } from "@/lib/ui/status-labels";

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-[18px] leading-6 font-semibold tracking-tight">{title}</h1>
        {description ? <p className="mt-0.5 text-[13px] text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  actionLabel,
  actionHref,
}: {
  title: string;
  description: string;
  actionLabel?: string;
  actionHref?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed bg-card/40 px-6 py-16 text-center">
      <p className="text-[15px] font-medium tracking-tight">{title}</p>
      <p className="mt-1.5 max-w-sm text-[13px] leading-5 text-muted-foreground">{description}</p>
      {actionLabel && actionHref ? (
        <Button asChild className="mt-4">
          <Link href={actionHref}>{actionLabel}</Link>
        </Button>
      ) : null}
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  badge,
}: {
  label: string;
  value: string;
  hint?: string;
  badge?: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border bg-card px-4 py-3.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[12px] text-muted-foreground">{label}</p>
        {badge}
      </div>
      <p className="mt-1 text-[20px] leading-6 font-semibold tracking-tight">{value}</p>
      {hint ? <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const tone: Record<string, string> = {
    READY: "bg-emerald-500/15 text-emerald-300",
    PUBLISHED: "bg-emerald-500/15 text-emerald-300",
    CONNECTED: "bg-emerald-500/15 text-emerald-300",
    LIVE: "bg-red-500/15 text-red-300",
            PROCESSING: "bg-amber-500/15 text-amber-300",
    TRANSCRIBING: "bg-amber-500/15 text-amber-300",
    ANALYZING: "bg-amber-500/15 text-amber-300",
    GENERATING: "bg-amber-500/15 text-amber-300",
    PROBING: "bg-amber-500/15 text-amber-300",
    AUDIO_EXTRACTING: "bg-amber-500/15 text-amber-300",
    CLIPPING: "bg-amber-500/15 text-amber-300",
    QUEUED: "bg-sky-500/15 text-sky-300",
    SCHEDULED: "bg-sky-500/15 text-sky-300",
    FAILED: "bg-red-500/15 text-red-300",
    TOKEN_EXPIRING: "bg-amber-500/15 text-amber-200",
    REAUTH_REQUIRED: "bg-amber-500/15 text-amber-200",
    CONFIGURATION_REQUIRED: "bg-amber-500/15 text-amber-200",
    EXPIRED: "bg-red-500/15 text-red-300",
    ERROR: "bg-red-500/15 text-red-300",
    UPLOADING: "bg-amber-500/15 text-amber-300",
    DRAFT: "bg-muted text-muted-foreground",
    OFFLINE: "bg-muted text-muted-foreground",
    CANCELED: "bg-muted text-muted-foreground",
    ARCHIVED: "bg-muted text-muted-foreground",
  };
  return (
    <span className={cn("inline-flex h-5 items-center rounded-md px-1.5 text-[11px] font-medium", tone[status] ?? "bg-muted text-muted-foreground")}>
      {statusLabel(status)}
    </span>
  );
}
