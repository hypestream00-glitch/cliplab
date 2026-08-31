"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { Pencil, Play, Send, Download } from "lucide-react";
import { formatDuration, scoreLabel } from "@/lib/utils/format";
import { cn } from "@/lib/utils";
import { StatusBadge } from "@/components/dashboard/primitives";
import { ClipMenu } from "@/components/clips/clip-menu";
import { mediaUrl } from "@/lib/storage/url";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { downloadClipAction } from "@/app/(studio)/studio/clips/actions";

export function ScoreBadge({ score }: { score: number }) {
  return (
    <div className="flex items-center gap-1.5" title="Estimativa da análise de IA com base no conteúdo transcrito. Não é garantia de performance.">
      <span
        className={cn(
          "inline-flex size-7 items-center justify-center rounded-full border text-[11px] font-semibold",
          score >= 90 && "border-emerald-400/40 text-emerald-300",
          score >= 75 && score < 90 && "border-sky-400/40 text-sky-300",
          score >= 60 && score < 75 && "border-amber-400/40 text-amber-300",
          score < 60 && "border-zinc-500/40 text-zinc-400",
        )}
      >
        {score}
      </span>
      <span className="text-[11px] text-muted-foreground">{scoreLabel(score)}</span>
    </div>
  );
}

export function ClipCard({
  id,
  title,
  durationMs,
  score,
  status,
  thumbnailKey,
  storageKey,
  caption,
  hashtags,
  selectable = false,
}: {
  id: string;
  title: string;
  durationMs: number;
  score?: number | null;
  status: string;
  thumbnailKey?: string | null;
  storageKey?: string | null;
  caption?: string | null;
  hashtags?: string[];
  selectable?: boolean;
}) {
  const thumb = mediaUrl(thumbnailKey);
  const src = mediaUrl(storageKey);
  const [hover, setHover] = useState(false);
  const [open, setOpen] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  return (
    <>
      <article className="group relative overflow-hidden rounded-2xl border bg-card">
        {selectable ? (
          <label className="absolute top-2 left-2 z-10 rounded bg-black/70 px-1.5 py-0.5 text-[11px] text-white">
            <input type="checkbox" name="clipIds" value={id} className="mr-1 accent-primary" />
            ZIP
          </label>
        ) : null}
        <button
          type="button"
          className="block w-full text-left"
          onMouseEnter={() => {
            setHover(true);
            if (videoRef.current) {
              videoRef.current.currentTime = 0;
              void videoRef.current.play().catch(() => undefined);
            }
          }}
          onMouseLeave={() => {
            setHover(false);
            videoRef.current?.pause();
          }}
          onClick={() => setOpen(true)}
        >
          <div className="relative aspect-[9/16] overflow-hidden bg-zinc-950">
            {thumb ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={thumb} alt="" className={cn("absolute inset-0 h-full w-full object-cover", hover && src && "opacity-0")} />
            ) : (
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(124,58,237,.28),transparent_55%),linear-gradient(180deg,transparent_30%,rgba(0,0,0,.78))]" />
            )}
            {src ? (
              <video
                ref={videoRef}
                src={hover ? src : undefined}
                poster={thumb ?? undefined}
                muted
                playsInline
                loop
                preload="none"
                className={cn("absolute inset-0 h-full w-full object-cover", hover ? "opacity-100" : "opacity-0")}
              />
            ) : null}
            {typeof score === "number" ? (
              <span className="absolute top-2 right-2 rounded-full bg-black/70 px-2 py-0.5 text-[11px] font-medium text-white">
                {score} · {scoreLabel(score)}
              </span>
            ) : null}
            <span className="absolute right-2 bottom-2 rounded bg-black/70 px-1.5 py-0.5 text-[11px] text-white">
              {formatDuration(durationMs)}
            </span>
            <div className="pointer-events-none absolute inset-0 hidden items-center justify-center gap-2 bg-black/35 group-hover:flex">
              <span className="rounded-full bg-black/70 p-2 text-white">
                <Play className="size-4" />
              </span>
            </div>
          </div>
        </button>
        <div className="space-y-1.5 p-2.5">
          <div className="flex items-start justify-between gap-2">
            <Link href={`/studio/clips/${id}`} className="line-clamp-2 text-[13px] font-medium leading-4">
              {title}
            </Link>
            <ClipMenu id={id} />
          </div>
          <div className="flex items-center justify-between gap-2">
            {typeof score === "number" ? <ScoreBadge score={score} /> : <span />}
            <StatusBadge status={status} />
          </div>
          <div className="hidden gap-1 group-hover:flex">
            <Button asChild size="xs" variant="outline">
              <Link href={`/studio/editor/${id}`}>
                <Pencil className="size-3" />
                Editar
              </Link>
            </Button>
            <Button asChild size="xs" variant="outline">
              <Link href={`/studio/publishing?clip=${id}`}>
                <Send className="size-3" />
                Publicar
              </Link>
            </Button>
          </div>
        </div>
      </article>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-4xl overflow-hidden p-0 sm:max-w-4xl">
          <div className="grid gap-0 md:grid-cols-[minmax(0,280px)_1fr]">
            <div className="bg-zinc-950">
              {src ? (
                <video src={src} poster={thumb ?? undefined} controls playsInline className="mx-auto aspect-[9/16] max-h-[80vh] w-full object-contain" />
              ) : thumb ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={thumb} alt="" className="mx-auto aspect-[9/16] max-h-[80vh] w-full object-contain" />
              ) : null}
            </div>
            <div className="space-y-3 p-5">
              <DialogTitle className="text-[18px] leading-6">{title}</DialogTitle>
              <div className="flex flex-wrap items-center gap-2 text-[13px] text-muted-foreground">
                {typeof score === "number" ? <ScoreBadge score={score} /> : null}
                <span>{formatDuration(durationMs)}</span>
                <StatusBadge status={status} />
              </div>
              {caption ? <p className="text-[13px] leading-5">{caption}</p> : null}
              {hashtags?.length ? (
                <p className="text-[12px] text-muted-foreground">{hashtags.map((tag) => `#${tag.replace(/^#/, "")}`).join(" ")}</p>
              ) : null}
              <div className="flex flex-wrap gap-2 pt-2">
                <Button asChild>
                  <Link href={`/studio/editor/${id}`}>Editar</Link>
                </Button>
                <form action={downloadClipAction}>
                  <input type="hidden" name="clipId" value={id} />
                  <Button variant="outline" type="submit">
                    <Download className="size-4" />
                    Download
                  </Button>
                </form>
                <Button asChild variant="outline">
                  <Link href={`/studio/publishing?clip=${id}`}>Publicar</Link>
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
