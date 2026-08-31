"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

type Props = {
  src: string | null;
  poster?: string | null;
  className?: string;
  currentTimeMs?: number;
  onTime?: (ms: number) => void;
  onDuration?: (ms: number) => void;
  playing?: boolean;
  volume?: number;
  muted?: boolean;
  playbackRate?: number;
};

export function VideoPlayer({
  src,
  poster,
  className,
  currentTimeMs,
  onTime,
  onDuration,
  playing,
  volume = 1,
  muted = false,
  playbackRate = 1,
}: Props) {
  const ref = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.volume = volume;
    el.muted = muted;
    el.playbackRate = playbackRate;
  }, [volume, muted, playbackRate]);

  useEffect(() => {
    const el = ref.current;
    if (!el || playing == null) return;
    if (playing) void el.play().catch(() => setError("Não foi possível reproduzir o vídeo."));
    else el.pause();
  }, [playing, src]);

  useEffect(() => {
    const el = ref.current;
    if (!el || currentTimeMs == null) return;
    const seconds = currentTimeMs / 1000;
    if (Math.abs(el.currentTime - seconds) > 0.35) {
      el.currentTime = Math.max(0, seconds);
    }
  }, [currentTimeMs]);

  if (!src) {
    return (
      <div className={className ?? "flex aspect-video items-center justify-center bg-zinc-900 text-[12px] text-zinc-400"}>
        Aguardando arquivo de vídeo.
      </div>
    );
  }

  return (
    <div className={className}>
      <video
        ref={ref}
        src={src}
        poster={poster ?? undefined}
        className="h-full w-full object-contain bg-black"
        playsInline
        preload="metadata"
        onTimeUpdate={(event) => onTime?.(event.currentTarget.currentTime * 1000)}
        onLoadedMetadata={(event) => onDuration?.(event.currentTarget.duration * 1000)}
        onError={() => setError("Falha ao carregar o vídeo.")}
      />
      {error ? <p className="mt-1 text-[11px] text-destructive">{error}</p> : null}
    </div>
  );
}

export function VideoControls({
  playing,
  onPlayPause,
  currentMs,
  durationMs,
  onSeek,
  volume,
  muted,
  onVolume,
  onMute,
}: {
  playing: boolean;
  onPlayPause: () => void;
  currentMs: number;
  durationMs: number;
  onSeek: (ms: number) => void;
  volume: number;
  muted: boolean;
  onVolume: (value: number) => void;
  onMute: () => void;
}) {
  return (
    <div className="flex items-center gap-2 px-2 py-1.5 text-[12px] text-zinc-300">
      <Button size="xs" variant="secondary" type="button" onClick={onPlayPause}>
        {playing ? "Pause" : "Play"}
      </Button>
      <input
        type="range"
        min={0}
        max={Math.max(1, durationMs)}
        value={Math.min(currentMs, durationMs)}
        onChange={(event) => onSeek(Number(event.target.value))}
        className="h-1 flex-1 accent-primary"
      />
      <span>
        {(currentMs / 1000).toFixed(1)}s / {(durationMs / 1000).toFixed(1)}s
      </span>
      <Button size="xs" variant="ghost" type="button" onClick={onMute}>
        {muted || volume === 0 ? "Som" : "Mudo"}
      </Button>
      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={muted ? 0 : volume}
        onChange={(event) => onVolume(Number(event.target.value))}
        className="h-1 w-20 accent-primary"
      />
    </div>
  );
}
