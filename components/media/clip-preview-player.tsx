"use client";

import { useState } from "react";
import { VideoControls, VideoPlayer } from "@/components/media/video-player";

export function ClipPreviewPlayer({ src, poster }: { src: string | null; poster?: string | null }) {
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);

  return (
    <div className="overflow-hidden rounded-lg border bg-zinc-950">
      <VideoPlayer
        src={src}
        poster={poster}
        className="aspect-[9/16] w-full"
        playing={playing}
        currentTimeMs={time}
        volume={volume}
        muted={muted}
        onTime={setTime}
        onDuration={setDuration}
      />
      <VideoControls
        playing={playing}
        onPlayPause={() => setPlaying((value) => !value)}
        currentMs={time}
        durationMs={duration}
        onSeek={(ms) => {
          setTime(ms);
          setPlaying(false);
        }}
        volume={volume}
        muted={muted}
        onVolume={(value) => {
          setVolume(value);
          setMuted(value === 0);
        }}
        onMute={() => setMuted((value) => !value)}
      />
    </div>
  );
}
