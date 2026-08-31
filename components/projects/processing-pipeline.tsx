"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { PIPELINE_DISPLAY_STEPS, PIPELINE_STAGE_LABELS, pipelineDisplayIndex, pipelineStageFromStatus } from "@/lib/pipeline/stages";
import { cn } from "@/lib/utils";
import { mediaUrl } from "@/lib/storage/url";

export function ProcessingPipeline({
  progress,
  message,
  status,
  thumbnailKey,
}: {
  progress: number;
  message?: string | null;
  status?: string | null;
  thumbnailKey?: string | null;
}) {
  const router = useRouter();
  const stage = pipelineStageFromStatus(status);
  const active = status ? pipelineDisplayIndex(status, progress, message) : -1;
  const heading = PIPELINE_STAGE_LABELS[stage] ?? "Analisando seu vídeo";
  const thumb = mediaUrl(thumbnailKey);

  useEffect(() => {
    if (stage === "READY" || stage === "FAILED") return;
    const id = window.setInterval(() => router.refresh(), 3000);
    return () => window.clearInterval(id);
  }, [router, stage]);

  return (
    <div className="overflow-hidden rounded-2xl border bg-card">
      <div className="flex flex-col gap-5 p-5 sm:flex-row">
        {thumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumb} alt="" className="h-40 w-24 shrink-0 rounded-xl object-cover" />
        ) : null}
        <div className="min-w-0 flex-1">
          <p className="text-[11px] tracking-[0.12em] text-muted-foreground uppercase">Analisando seu vídeo</p>
          <p className="mt-1 text-[16px] font-medium">{heading}</p>
          <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-muted">
            <div className="h-full bg-primary transition-all" style={{ width: `${Math.max(0, Math.min(100, progress))}%` }} />
          </div>
          <p className="mt-2 text-[12px] text-muted-foreground">{Math.max(0, Math.min(100, progress))}%</p>
          {status ? (
            <ol className="mt-4 space-y-2">
              {PIPELINE_DISPLAY_STEPS.map((step, index) => (
                <li key={step} className="flex items-center gap-2.5 text-[13px]">
                  <span
                    className={cn(
                      "flex size-5 items-center justify-center rounded-full border text-[11px]",
                      index < active && "border-primary bg-primary text-primary-foreground",
                      index === active && "border-primary text-primary",
                      index > active && "border-border text-muted-foreground",
                    )}
                    aria-hidden
                  >
                    {index < active ? "✓" : index === active ? "●" : "○"}
                  </span>
                  <span className={cn(index <= active ? "text-foreground" : "text-muted-foreground")}>{step}</span>
                </li>
              ))}
            </ol>
          ) : null}
          <p className="mt-4 text-[12px] text-muted-foreground">Você pode sair desta página. O processamento continua.</p>
        </div>
      </div>
    </div>
  );
}
