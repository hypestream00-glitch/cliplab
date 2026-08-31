export type CaptionCue = {
  startMs: number;
  endMs: number;
  text: string;
  words?: Array<{ startMs: number; endMs: number; text: string }>;
};

export type CaptionFormatOptions = {
  maxWordsPerLine?: number;
  maxCharactersPerLine?: number;
  maxLines?: number;
};

function wrapLine(words: string[], maxWords: number, maxChars: number) {
  const lines: string[] = [];
  let current: string[] = [];
  for (const word of words) {
    const next = [...current, word].join(" ");
    if (current.length >= maxWords || next.length > maxChars) {
      if (current.length) lines.push(current.join(" "));
      current = [word];
    } else {
      current.push(word);
    }
  }
  if (current.length) lines.push(current.join(" "));
  return lines;
}

export function formatCaptions(
  segments: Array<{ startMs: number; endMs: number; text: string; words?: CaptionCue["words"] }>,
  options: CaptionFormatOptions = {},
): CaptionCue[] {
  const maxWords = Math.max(1, options.maxWordsPerLine ?? 6);
  const maxChars = Math.max(8, options.maxCharactersPerLine ?? 32);
  const maxLines = Math.max(1, options.maxLines ?? 2);
  const cues: CaptionCue[] = [];
  for (const segment of segments) {
    const words = segment.text.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
    if (!words.length) continue;
    const lines = wrapLine(words, maxWords, maxChars);
    const chunks: string[][] = [];
    for (let i = 0; i < lines.length; i += maxLines) {
      chunks.push(lines.slice(i, i + maxLines));
    }
    const span = Math.max(1, segment.endMs - segment.startMs);
    chunks.forEach((chunk, index) => {
      const start = segment.startMs + Math.round((span * index) / chunks.length);
      const end = index === chunks.length - 1 ? segment.endMs : segment.startMs + Math.round((span * (index + 1)) / chunks.length);
      const text = chunk.join("\n");
      const cueWords = (segment.words ?? []).filter((word) => word.startMs < end && word.endMs > start);
      cues.push({ startMs: start, endMs: Math.max(start + 1, end), text, words: cueWords.length ? cueWords : undefined });
    });
  }
  return cues;
}

export function currentWord(cues: CaptionCue[], timeMs: number) {
  const cue = cues.find((item) => timeMs >= item.startMs && timeMs <= item.endMs);
  if (!cue?.words?.length) {
    if (!cue) return null;
    return { cue, word: null as string | null };
  }
  const word = cue.words.find((item) => timeMs >= item.startMs && timeMs <= item.endMs) ?? null;
  return { cue, word: word?.text ?? null };
}
