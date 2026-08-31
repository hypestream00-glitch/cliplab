export type TranscriptWord = {
  startMs: number;
  endMs: number;
  text: string;
  confidence?: number;
};

export type TranscriptSegmentInput = {
  startMs: number;
  endMs: number;
  text: string;
  speakerId?: string;
  confidence?: number;
  words?: TranscriptWord[];
};

export function normalizeTranscript(
  segments: TranscriptSegmentInput[],
  durationMs: number,
): TranscriptSegmentInput[] {
  const cleaned = segments
    .map((segment) => ({
      ...segment,
      startMs: Math.max(0, Math.round(segment.startMs)),
      endMs: Math.min(durationMs, Math.round(segment.endMs)),
      text: segment.text.replace(/\s+/g, " ").trim(),
      words: (segment.words ?? [])
        .map((word) => ({
          ...word,
          startMs: Math.max(0, Math.round(word.startMs)),
          endMs: Math.min(durationMs, Math.round(word.endMs)),
          text: word.text.replace(/\s+/g, " ").trim(),
        }))
        .filter((word) => word.text && word.endMs > word.startMs),
    }))
    .filter((segment) => segment.text && segment.endMs > segment.startMs)
    .sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);

  const result: TranscriptSegmentInput[] = [];
  for (const segment of cleaned) {
    const previous = result[result.length - 1];
    if (previous && segment.startMs < previous.endMs) {
      segment.startMs = previous.endMs;
      if (segment.endMs <= segment.startMs) continue;
      if (segment.words) {
        segment.words = segment.words.filter((word) => word.startMs >= segment.startMs);
      }
    }
    result.push(segment);
  }
  return result;
}

export function snapWindowToSpeech(
  startMs: number,
  endMs: number,
  segments: TranscriptSegmentInput[],
  durationMs: number,
  minMs: number,
  maxMs: number,
) {
  const window = { startMs, endMs };
  const first = segments.find((segment) => segment.endMs > startMs && segment.startMs < endMs);
  if (first && Math.abs(first.startMs - startMs) <= 1500) {
    window.startMs = first.startMs;
  }
  const overlapping = segments.filter((segment) => segment.endMs > window.startMs && segment.startMs < endMs);
  const last = overlapping[overlapping.length - 1];
  if (last && Math.abs(last.endMs - endMs) <= 2000) {
    window.endMs = last.endMs;
  }
  window.startMs = Math.max(0, window.startMs);
  window.endMs = Math.min(durationMs, window.endMs);
  if (window.endMs - window.startMs < Math.min(minMs, durationMs)) {
    window.endMs = Math.min(durationMs, window.startMs + Math.min(minMs, durationMs));
  }
  if (window.endMs - window.startMs > maxMs) {
    window.endMs = window.startMs + maxMs;
  }
  if (window.endMs <= window.startMs) {
    window.startMs = 0;
    window.endMs = Math.min(durationMs, maxMs);
  }
  return window;
}
