import type { ProcessingCapabilities } from "@/lib/media/capabilities";
import { normalizeExecutionBadge } from "@/lib/pipeline/stages";
import { cn } from "@/lib/utils";

const ITEMS: Array<{ key: keyof ProcessingCapabilities; label: string }> = [
  { key: "video", label: "VIDEO PROCESSING" },
  { key: "clipping", label: "FFMPEG CLIPPING" },
  { key: "render", label: "FFMPEG RENDER" },
  { key: "transcription", label: "TRANSCRIPTION" },
  { key: "analysis", label: "CLIP ANALYSIS" },
];

export function CapabilityBanner({
  capabilities,
  pipelineMeta,
}: {
  capabilities: ProcessingCapabilities;
  pipelineMeta?: Record<string, unknown> | null;
}) {
  const hasMeta = Boolean(pipelineMeta && Object.keys(pipelineMeta).length);
  const transcription = hasMeta
    ? normalizeExecutionBadge(pipelineMeta?.transcriptionProvider ?? pipelineMeta?.transcription)
    : normalizeExecutionBadge(capabilities.transcription);
  const analysis = hasMeta
    ? normalizeExecutionBadge(pipelineMeta?.analysisProvider ?? pipelineMeta?.analysis)
    : normalizeExecutionBadge(capabilities.analysis);
  const source: Record<string, string> = {
    video: String((hasMeta ? pipelineMeta?.video : capabilities.video) ?? capabilities.video).toUpperCase(),
    clipping: String((hasMeta ? pipelineMeta?.clipping : capabilities.clipping) ?? capabilities.clipping).toUpperCase(),
    render: String((hasMeta ? pipelineMeta?.render : capabilities.render) ?? capabilities.render).toUpperCase(),
    transcription: transcription === "PENDING" ? "PENDING" : transcription,
    analysis: analysis === "PENDING" ? "PENDING" : analysis,
  };

  return (
    <div className="mb-3 flex flex-wrap gap-1.5">
      {ITEMS.map((item) => {
        const display = source[item.key] ?? "PENDING";
        return (
          <span
            key={item.key}
            className={cn(
              "rounded-md border px-2 py-0.5 text-[10px] font-semibold tracking-wide",
              (display === "REAL" || display === "OPENAI") && "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
              display === "MOCK" && "border-amber-500/40 bg-amber-500/10 text-amber-200",
              (display === "UNAVAILABLE" || display === "INDISPONÍVEL") && "border-destructive/40 bg-destructive/10 text-destructive",
              display === "PENDING" && "border-border bg-muted/40 text-muted-foreground",
            )}
          >
            {item.label}: {display === "OPENAI" ? "REAL" : display}
          </span>
        );
      })}
    </div>
  );
}
