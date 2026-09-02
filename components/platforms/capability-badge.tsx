import { capabilityLabel, type CapabilityState } from "@/lib/platforms/capabilities";

const STYLES: Record<CapabilityState, string> = {
  AVAILABLE: "border-emerald-500/40 text-emerald-300",
  NOT_CONFIGURED: "border-amber-500/40 text-amber-200",
  NOT_SUPPORTED: "border-white/15 text-text-secondary",
  REQUIRES_APPROVAL: "border-gold/40 text-gold",
  BETA: "border-magenta/40 text-magenta",
};

export function PlatformCapabilityBadge({
  state,
  label,
  hint,
}: {
  state: CapabilityState;
  label: string;
  hint?: string;
}) {
  const mark = state === "AVAILABLE" ? "✓" : state === "BETA" ? "β" : "○";
  const title = hint ?? `${label}: ${capabilityLabel(state)}`;
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-medium ${STYLES[state]}`}
    >
      {mark} {label}
    </span>
  );
}

export function PlatformLimitedBadge({ title }: { title: string }) {
  return (
    <span
      title={title}
      className="inline-flex items-center rounded-md border border-white/15 px-1.5 py-0.5 text-[10px] font-medium text-text-secondary"
    >
      API limitada
    </span>
  );
}
