export type CaptionPresetId = "Minimal" | "Viral" | "Gaming" | "Podcast" | "Bold" | "Clean" | "Creator" | "Impact";

export type CaptionPresetStyle = {
  id: CaptionPresetId;
  fontSize: number;
  fontWeight: number;
  position: "bottom" | "center" | "top";
  background: string | null;
  outline: string | null;
  shadow: string | null;
  color: string;
  wordHighlight: boolean;
  maxWordsPerLine: number;
  alignment: "left" | "center" | "right";
};

export const CAPTION_PRESETS: Record<CaptionPresetId, CaptionPresetStyle> = {
  Minimal: {
    id: "Minimal",
    fontSize: 42,
    fontWeight: 500,
    position: "bottom",
    background: null,
    outline: "#000000",
    shadow: null,
    color: "#ffffff",
    wordHighlight: false,
    maxWordsPerLine: 6,
    alignment: "center",
  },
  Viral: {
    id: "Viral",
    fontSize: 58,
    fontWeight: 800,
    position: "bottom",
    background: "#000000",
    outline: "#111111",
    shadow: "#000000",
    color: "#ffffff",
    wordHighlight: true,
    maxWordsPerLine: 4,
    alignment: "center",
  },
  Gaming: {
    id: "Gaming",
    fontSize: 54,
    fontWeight: 800,
    position: "bottom",
    background: "#111827",
    outline: "#22c55e",
    shadow: "#000000",
    color: "#f8fafc",
    wordHighlight: true,
    maxWordsPerLine: 5,
    alignment: "center",
  },
  Podcast: {
    id: "Podcast",
    fontSize: 44,
    fontWeight: 600,
    position: "bottom",
    background: "#0f172a",
    outline: null,
    shadow: "#000000",
    color: "#f8fafc",
    wordHighlight: false,
    maxWordsPerLine: 7,
    alignment: "center",
  },
  Bold: {
    id: "Bold",
    fontSize: 56,
    fontWeight: 800,
    position: "bottom",
    background: "#000000",
    outline: "#ffffff",
    shadow: "#000000",
    color: "#ffffff",
    wordHighlight: true,
    maxWordsPerLine: 5,
    alignment: "center",
  },
  Clean: {
    id: "Clean",
    fontSize: 46,
    fontWeight: 600,
    position: "bottom",
    background: null,
    outline: "#0f172a",
    shadow: "#000000",
    color: "#ffffff",
    wordHighlight: false,
    maxWordsPerLine: 6,
    alignment: "center",
  },
  Creator: {
    id: "Creator",
    fontSize: 56,
    fontWeight: 800,
    position: "bottom",
    background: "#000000",
    outline: "#facc15",
    shadow: "#000000",
    color: "#ffffff",
    wordHighlight: true,
    maxWordsPerLine: 4,
    alignment: "center",
  },
  Impact: {
    id: "Impact",
    fontSize: 62,
    fontWeight: 800,
    position: "center",
    background: null,
    outline: "#000000",
    shadow: "#000000",
    color: "#ffffff",
    wordHighlight: true,
    maxWordsPerLine: 3,
    alignment: "center",
  },
};

export function getCaptionPreset(name: string): CaptionPresetStyle {
  return CAPTION_PRESETS[(name as CaptionPresetId)] ?? CAPTION_PRESETS.Bold;
}

export function captionY(position: CaptionPresetStyle["position"], canvasHeight: number) {
  if (position === "top") return Math.round(canvasHeight * 0.12);
  if (position === "center") return Math.round(canvasHeight * 0.46);
  return Math.round(canvasHeight * 0.82);
}
