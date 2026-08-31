import { writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import type { CaptionCue } from "@/lib/captions/format";
import type { CaptionPresetStyle } from "@/lib/captions/presets";

function assTime(ms: number) {
  const clamped = Math.max(0, ms);
  const h = Math.floor(clamped / 3_600_000);
  const m = Math.floor((clamped % 3_600_000) / 60_000);
  const s = Math.floor((clamped % 60_000) / 1000);
  const cs = Math.floor((clamped % 1000) / 10);
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
}

function assColor(hex: string | null | undefined, alpha = "00") {
  if (!hex) return `&H${alpha}000000`;
  const clean = hex.replace("#", "");
  const r = clean.slice(0, 2);
  const g = clean.slice(2, 4);
  const b = clean.slice(4, 6);
  return `&H${alpha}${b}${g}${r}`.toUpperCase();
}

function escapeAss(text: string) {
  return text
    .replaceAll("\\", "\\\\")
    .replaceAll("{", "\\{")
    .replaceAll("}", "\\}")
    .replaceAll("\n", "\\N");
}

function karaokeLine(cue: CaptionCue) {
  if (!cue.words?.length) return escapeAss(cue.text);
  return cue.words
    .map((word, index) => {
      const next = cue.words![index + 1];
      const dur = Math.max(1, Math.round(((next?.startMs ?? cue.endMs) - word.startMs) / 10));
      return `{\\k${dur}}${escapeAss(word.text)}`;
    })
    .join(" ");
}

export function buildAssDocument(params: {
  width: number;
  height: number;
  cues: CaptionCue[];
  style: CaptionPresetStyle;
  wordHighlight: boolean;
}) {
  const alignment = params.style.position === "top" ? 8 : params.style.position === "center" ? 5 : 2;
  const marginV = params.style.position === "top" ? 80 : params.style.position === "center" ? Math.round(params.height / 2 - 40) : 80;
  const outline = params.style.outline ? 2 : 0;
  const shadow = params.style.shadow ? 2 : 0;
  const back = params.style.background ? assColor(params.style.background, "80") : "&H80000000";
  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: ${params.width}
PlayResY: ${params.height}
WrapStyle: 2
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,${params.style.fontSize},${assColor(params.style.color)},${assColor("#ffff00")},${assColor(params.style.outline ?? "#000000")},${back},${params.style.fontWeight >= 700 ? -1 : 0},0,0,0,100,100,0,0,${params.style.background ? 3 : 1},${outline},${shadow},${alignment},40,40,${marginV},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;
  const events = params.cues
    .filter((cue) => cue.text.trim() && cue.endMs > cue.startMs)
    .map((cue) => {
      const text = params.wordHighlight && cue.words?.length ? karaokeLine(cue) : escapeAss(cue.text);
      return `Dialogue: 0,${assTime(cue.startMs)},${assTime(cue.endMs)},Default,,0,0,0,,${text}`;
    })
    .join("\n");
  return `${header}${events}\n`;
}

export async function writeTempAssFile(dir: string, contents: string) {
  const file = path.join(dir, `captions-${Date.now()}-${Math.random().toString(16).slice(2)}.ass`);
  await writeFile(file, contents, "utf8");
  return file;
}

export async function removeTempAssFile(file: string | null | undefined) {
  if (!file) return;
  await unlink(file).catch(() => undefined);
}

export function ffmpegAssPath(file: string) {
  return file.replaceAll("\\", "/").replaceAll(":", "\\:").replaceAll("'", "\\'");
}
