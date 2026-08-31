let active = 0;
const waiters: Array<() => void> = [];

export function ffmpegMaxConcurrency() {
  const n = Number(process.env.FFMPEG_MAX_CONCURRENCY ?? "1");
  return Number.isFinite(n) && n > 0 ? Math.min(4, Math.floor(n)) : 1;
}

export function ffmpegMaxDurationMs() {
  const n = Number(process.env.FFMPEG_MAX_DURATION_SEC ?? "14400");
  return Number.isFinite(n) && n > 0 ? n * 1000 : 14_400_000;
}

export function ffmpegTimeoutMs(fallback: number) {
  const n = Number(process.env.FFMPEG_TIMEOUT_MS ?? "");
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export async function withFfmpegSlot<T>(fn: () => Promise<T>): Promise<T> {
  const max = ffmpegMaxConcurrency();
  if (active >= max) {
    await new Promise<void>((resolve) => waiters.push(resolve));
  }
  active += 1;
  try {
    return await fn();
  } finally {
    active -= 1;
    const next = waiters.shift();
    if (next) next();
  }
}
