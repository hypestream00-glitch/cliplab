import type { ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { statusLabel } from "@/lib/ui/status-labels";

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-[26px] leading-8 font-semibold tracking-tight text-white">{title}</h1>
        {description ? <p className="mt-1.5 max-w-2xl text-[14px] leading-6 text-text-secondary">{description}</p> : null}
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
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card/40 px-8 py-20 text-center">
      <p className="text-[16px] font-medium tracking-tight text-white">{title}</p>
      <p className="mt-2 max-w-sm text-[14px] leading-6 text-text-secondary">{description}</p>
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
  badge?: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card px-5 py-5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[13px] text-text-secondary">{label}</p>
        {badge}
      </div>
      <p className="mt-2 text-[24px] leading-7 font-semibold tracking-tight gradient-brand-text">{value}</p>
      {hint ? <p className="mt-1.5 text-[12px] text-text-secondary">{hint}</p> : null}
    </div>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const tone: Record<string, string> = {
    READY: "bg-violet-500/15 text-violet-300",
    PUBLISHED: "bg-emerald-500/15 text-emerald-300",
    CONNECTED: "bg-emerald-500/15 text-emerald-300",
    LIVE: "bg-red-500/15 text-red-300",
    PROCESSING: "bg-sky-500/15 text-sky-300",
    TRANSCRIBING: "bg-sky-500/15 text-sky-300",
    ANALYZING: "bg-sky-500/15 text-sky-300",
    GENERATING: "bg-sky-500/15 text-sky-300",
    PROBING: "bg-sky-500/15 text-sky-300",
    AUDIO_EXTRACTING: "bg-sky-500/15 text-sky-300",
    CLIPPING: "bg-sky-500/15 text-sky-300",
    QUEUED: "bg-sky-500/15 text-sky-300",
    WAITING: "bg-sky-500/15 text-sky-300",
    ACTIVE: "bg-sky-500/15 text-sky-300",
    SCHEDULED: "bg-yellow-500/15 text-yellow-300",
    FAILED: "bg-red-500/15 text-red-300",
    TOKEN_EXPIRING: "bg-amber-500/15 text-amber-200",
    REAUTH_REQUIRED: "bg-amber-500/15 text-amber-200",
    CONFIGURATION_REQUIRED: "bg-amber-500/15 text-amber-200",
    EXPIRED: "bg-red-500/15 text-red-300",
    ERROR: "bg-red-500/15 text-red-300",
    UPLOADING: "bg-sky-500/15 text-sky-300",
    DRAFT: "bg-muted text-muted-foreground",
    OFFLINE: "bg-muted text-muted-foreground",
    CANCELED: "bg-muted text-muted-foreground",
    CANCELLED: "bg-red-500/15 text-red-300",
    ARCHIVED: "bg-muted text-muted-foreground",
    FINALIZING: "bg-yellow-500/15 text-yellow-300",
    FINISHED: "bg-violet-500/15 text-violet-300",
    PENDING: "bg-yellow-500/15 text-yellow-300",
    VERIFIED: "bg-emerald-500/15 text-emerald-300",
    REJECTED: "bg-red-500/15 text-red-300",
    REMOVED: "bg-red-500/15 text-red-300",
    FLAGGED: "bg-amber-500/15 text-amber-200",
    OPEN: "bg-emerald-500/15 text-emerald-300",
    CLOSED: "bg-violet-500/15 text-violet-300",
    PAID: "bg-emerald-500/15 text-emerald-300",
    APPROVED: "bg-sky-500/15 text-sky-300",
  };
  return (
    <span className={cn("inline-flex h-5 items-center rounded-md px-1.5 text-[11px] font-medium", tone[status] ?? "bg-muted text-muted-foreground")}>
      {statusLabel(status)}
    </span>
  );
}
