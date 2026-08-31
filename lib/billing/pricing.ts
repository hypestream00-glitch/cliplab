export function creditsForDurationMs(durationMs: number) {
  return Math.max(1, Math.ceil(Math.max(0, durationMs) / 60_000));
}
