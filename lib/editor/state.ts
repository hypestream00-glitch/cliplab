export type OverlayAlignment = "left" | "center" | "right";
export type OverlayType = "text" | "caption" | "image";

export type EditorOverlay = {
  id: string;
  type: OverlayType;
  text: string;
  x: number;
  y: number;
  scale: number;
  fontSize: number;
  fontWeight: number;
  color: string;
  background: string | null;
  alignment: OverlayAlignment;
  startMs: number;
  endMs: number;
  storageKey?: string | null;
  words?: Array<{ startMs: number; endMs: number; text: string }>;
};

export type EditorCanvasState = {
  trimStartMs: number;
  trimEndMs: number;
  crop: { x: number; y: number; w: number; h: number } | null;
  scale: number;
  offsetX: number;
  offsetY: number;
  overlays: EditorOverlay[];
};

export function canvasSize(ratio: string) {
  if (ratio === "16:9") return { w: 1920, h: 1080 };
  if (ratio === "1:1") return { w: 1080, h: 1080 };
  if (ratio === "4:5") return { w: 1080, h: 1350 };
  return { w: 1080, h: 1920 };
}

export function outputSize(ratio: string, resolution: "720p" | "1080p") {
  const base = canvasSize(ratio);
  if (resolution === "1080p") return base;
  const factor = 720 / Math.min(base.w, base.h);
  return { w: Math.round(base.w * factor / 2) * 2, h: Math.round(base.h * factor / 2) * 2 };
}

export function defaultCanvas(durationMs: number): EditorCanvasState {
  return {
    trimStartMs: 0,
    trimEndMs: Math.max(0, durationMs),
    crop: null,
    scale: 1,
    offsetX: 0,
    offsetY: 0,
    overlays: [],
  };
}

export function parseCanvas(raw: unknown, durationMs: number): EditorCanvasState {
  const fallback = defaultCanvas(durationMs);
  if (!raw || typeof raw !== "object") return fallback;
  const value = raw as Partial<EditorCanvasState>;
  return {
    trimStartMs: Math.max(0, Number(value.trimStartMs) || 0),
    trimEndMs: Math.min(durationMs, Number(value.trimEndMs) || durationMs),
    crop: value.crop ?? null,
    scale: Number(value.scale) || 1,
    offsetX: Number(value.offsetX) || 0,
    offsetY: Number(value.offsetY) || 0,
    overlays: Array.isArray(value.overlays) ? value.overlays : [],
  };
}
