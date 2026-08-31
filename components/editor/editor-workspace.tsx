"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { saveEditorStateAction, uploadOverlayImageAction } from "@/app/(studio)/studio/editor/actions";
import { renderClipAction } from "@/app/(studio)/studio/clips/actions";
import { applyTemplateAction } from "@/app/(studio)/studio/templates/actions";
import { VideoControls, VideoPlayer } from "@/components/media/video-player";
import { canvasSize, defaultCanvas, type EditorCanvasState, type EditorOverlay } from "@/lib/editor/state";
import { CAPTION_PRESETS, getCaptionPreset, captionY } from "@/lib/captions/presets";
import type { ProcessingCapabilities } from "@/lib/media/capabilities";
import { mediaUrl } from "@/lib/storage/url";

const TOOLS = [
  { id: "Captions", label: "Legendas" },
  { id: "Text", label: "Texto" },
  { id: "Layouts", label: "Layout" },
  { id: "Media", label: "Crop e logo" },
  { id: "Brand", label: "Cores" },
  { id: "Templates", label: "Modelos" },
] as const;
const PRESETS = ["TikTok", "Instagram Reel", "YouTube Shorts", "X", "LinkedIn"] as const;
const CAPTION_PRESET_IDS = Object.keys(CAPTION_PRESETS) as Array<keyof typeof CAPTION_PRESETS>;

type Props = {
  clipId: string;
  title: string;
  caption?: string;
  hashtags?: string[];
  durationMs: number;
  videoSrc: string | null;
  poster: string | null;
  initialRatio?: string;
  initialCaptionPreset?: string;
  initialCanvas?: EditorCanvasState;
  captionsFromTranscript?: EditorOverlay[];
  templates?: Array<{ id: string; name: string }>;
  appliedTemplateId?: string | null;
  capabilities: ProcessingCapabilities;
  maxResolution?: "720p" | "1080p";
};

function newId() {
  return typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `el-${Date.now()}`;
}

export function EditorWorkspace({
  clipId,
  title,
  caption = "",
  hashtags = [],
  durationMs,
  videoSrc,
  poster,
  initialRatio = "9:16",
  initialCaptionPreset = "Bold",
  initialCanvas,
  captionsFromTranscript = [],
  templates = [],
  appliedTemplateId = null,
  capabilities,
  maxResolution = "1080p",
}: Props) {
  const [tool, setTool] = useState<(typeof TOOLS)[number]["id"]>("Captions");
  const [exportOpen, setExportOpen] = useState(false);
  const [exportResolution, setExportResolution] = useState<"720p" | "1080p">(maxResolution);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [zoom, setZoom] = useState(100);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [saveState, setSaveState] = useState<"saved" | "saving">("saved");
  const [ratio, setRatio] = useState(initialRatio);
  const [captionPreset, setCaptionPreset] = useState(initialCaptionPreset);
  const [clipTitle, setClipTitle] = useState(title);
  const [clipCaption, setClipCaption] = useState(caption);
  const [clipHashtags, setClipHashtags] = useState(hashtags.map((tag) => `#${tag.replace(/^#/, "")}`).join(" "));
  const [wordHighlight, setWordHighlight] = useState(getCaptionPreset(initialCaptionPreset).wordHighlight);
  const [maxWords, setMaxWords] = useState(getCaptionPreset(initialCaptionPreset).maxWordsPerLine);
  const [exporting, setExporting] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [canvas, setCanvas] = useState<EditorCanvasState>(
    initialCanvas?.overlays.length
      ? initialCanvas
      : {
          ...(initialCanvas ?? defaultCanvas(durationMs)),
          overlays: captionsFromTranscript.length ? captionsFromTranscript : (initialCanvas?.overlays ?? []),
        },
  );
  const past = useRef<Array<{ canvas: EditorCanvasState; ratio: string }>>([]);
  const future = useRef<Array<{ canvas: EditorCanvasState; ratio: string }>>([]);
  const skipFirstSave = useRef(true);
  const size = canvasSize(ratio);

  function pushHistory() {
    past.current = [...past.current.slice(-40), { canvas, ratio }];
    future.current = [];
  }

  function undo() {
    const previous = past.current.pop();
    if (!previous) return;
    future.current.push({ canvas, ratio });
    setCanvas(previous.canvas);
    setRatio(previous.ratio);
  }

  function redo() {
    const next = future.current.pop();
    if (!next) return;
    past.current.push({ canvas, ratio });
    setCanvas(next.canvas);
    setRatio(next.ratio);
  }

  const selected = canvas.overlays.find((item) => item.id === selectedId) ?? null;
  const liveCaptions = canvas.overlays.filter(
    (item) => item.type === "caption" && time >= item.startMs && time <= item.endMs,
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.code === "Space" && !(event.target instanceof HTMLInputElement) && !(event.target instanceof HTMLSelectElement) && !(event.target instanceof HTMLTextAreaElement)) {
        event.preventDefault();
        setPlaying((value) => !value);
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  useEffect(() => {
    if (skipFirstSave.current) {
      skipFirstSave.current = false;
      return;
    }
    setSaveState("saving");
    const timer = window.setTimeout(() => {
      void saveEditorStateAction({
        clipId,
        aspectRatio: ratio,
        captionPreset,
        captionStyle: { maxWords, wordHighlight },
        canvas,
        templateId: appliedTemplateId,
        title: clipTitle,
        suggestedCaption: clipCaption,
        hashtags: clipHashtags.split(/[\s,]+/).map((tag) => tag.replace(/^#/, "")).filter(Boolean),
      }).then(() => setSaveState("saved")).catch(() => setSaveState("saved"));
    }, 700);
    return () => window.clearTimeout(timer);
  }, [clipId, ratio, captionPreset, maxWords, wordHighlight, canvas, appliedTemplateId, clipTitle, clipCaption, clipHashtags]);

  async function handleExport() {
    setExporting(true);
    await saveEditorStateAction({
      clipId,
      aspectRatio: ratio,
      captionPreset,
      captionStyle: { maxWords, wordHighlight },
      canvas,
      templateId: appliedTemplateId,
      createRevision: true,
      title: clipTitle,
      suggestedCaption: clipCaption,
      hashtags: clipHashtags.split(/[\s,]+/).map((tag) => tag.replace(/^#/, "")).filter(Boolean),
    });
    const form = new FormData();
    form.set("clipId", clipId);
    form.set("resolution", exportResolution);
    await renderClipAction(form);
  }

  function updateOverlay(id: string, patch: Partial<EditorOverlay>) {
    pushHistory();
    setCanvas((current) => ({
      ...current,
      overlays: current.overlays.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    }));
  }

  function addOverlay(type: EditorOverlay["type"]) {
    pushHistory();
    const overlay: EditorOverlay = {
      id: newId(),
      type,
      text: type === "caption" ? "Legenda" : type === "text" ? "Texto" : "",
      x: type === "caption" ? 80 : 80,
      y: type === "caption" ? size.h - 280 : 120,
      scale: 1,
      fontSize: type === "caption" ? 52 : 48,
      fontWeight: 700,
      color: "#ffffff",
      background: type === "caption" ? "#000000" : null,
      alignment: "center",
      startMs: canvas.trimStartMs,
      endMs: canvas.trimEndMs,
    };
    setCanvas((current) => ({ ...current, overlays: [...current.overlays, overlay] }));
    setSelectedId(overlay.id);
    setTool(type === "caption" ? "Captions" : type === "image" ? "Media" : "Text");
  }

  async function onLogo(file: File) {
    const form = new FormData();
    form.set("file", file);
    const result = await uploadOverlayImageAction(form);
    if ("error" in result && result.error) return;
    if (!("storageKey" in result) || !result.storageKey) return;
    pushHistory();
    const overlay: EditorOverlay = {
      id: newId(),
      type: "image",
      text: "",
      x: 40,
      y: 40,
      scale: 1,
      fontSize: 12,
      fontWeight: 400,
      color: "#ffffff",
      background: null,
      alignment: "left",
      startMs: canvas.trimStartMs,
      endMs: canvas.trimEndMs,
      storageKey: result.storageKey,
    };
    setCanvas((current) => ({ ...current, overlays: [...current.overlays, overlay] }));
    setSelectedId(overlay.id);
  }

  const progress = durationMs ? (time / durationMs) * 100 : 0;
  const activeCaption = useMemo(
    () => liveCaptions[0]?.text.split(" ").slice(0, maxWords).join(" ") ?? "",
    [liveCaptions, maxWords],
  );

  return (
    <div className="flex h-[calc(100vh-48px-40px)] flex-col" data-clip-id={clipId} data-video={capabilities.video} data-render={capabilities.render}>
      <div className="mb-2 flex h-10 items-center justify-between rounded-lg border bg-card px-2 text-[12px]">
        <div className="flex items-center gap-2">
          <h1 className="text-[13px] font-medium">{clipTitle}</h1>
          <span className="text-muted-foreground">{saveState === "saving" ? "Salvando..." : "Salvo"}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Button size="xs" variant="ghost" type="button" onClick={undo}>
            Desfazer
          </Button>
          <Button size="xs" variant="ghost" type="button" onClick={redo}>
            Refazer
          </Button>
          {PRESETS.map((preset) => (
            <button
              key={preset}
              className="rounded-md px-2 py-1 hover:bg-muted"
              onClick={() => {
                pushHistory();
                setRatio(preset.includes("LinkedIn") || preset === "X" ? "1:1" : "9:16");
              }}
              type="button"
            >
              {preset}
            </button>
          ))}
          <Button size="sm" type="button" onClick={() => setExportOpen(true)} disabled={exporting}>
            {exporting ? "Exportando..." : "Exportar"}
          </Button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-2 lg:grid lg:grid-cols-[184px_minmax(0,1fr)_240px]">
        <aside className="flex gap-1 overflow-auto rounded-lg border bg-card p-2 lg:flex-col">
          {TOOLS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTool(item.id)}
              className={`flex h-8 shrink-0 items-center rounded-md px-2 text-left text-[13px] lg:w-full ${tool === item.id ? "bg-muted" : "hover:bg-muted/50"}`}
            >
              {item.label}
            </button>
          ))}
        </aside>

        <section className="flex min-h-0 flex-col rounded-lg border bg-zinc-950">
          <div className="flex flex-1 items-center justify-center overflow-hidden">
            <div
              className="relative overflow-hidden bg-zinc-900 shadow-inner"
              style={{
                width: size.w * (zoom / 100) * (260 / size.w),
                height: size.h * (zoom / 100) * (260 / size.w),
              }}
            >
              <VideoPlayer
                src={videoSrc}
                poster={poster}
                className="absolute inset-0"
                currentTimeMs={time}
                playing={playing}
                volume={volume}
                muted={muted}
                onTime={(ms) => {
                  if (ms >= canvas.trimEndMs) {
                    setPlaying(false);
                    setTime(canvas.trimStartMs);
                    return;
                  }
                  setTime(ms);
                }}
              />
              {canvas.overlays.map((overlay) => {
                if (time < overlay.startMs || time > overlay.endMs) return null;
                if (overlay.type === "image" && overlay.storageKey) {
                  return (
                    <img
                      key={overlay.id}
                      src={mediaUrl(overlay.storageKey) ?? ""}
                      alt=""
                      className="absolute"
                      style={{
                        left: `${(overlay.x / size.w) * 100}%`,
                        top: `${(overlay.y / size.h) * 100}%`,
                        width: 80 * overlay.scale,
                      }}
                    />
                  );
                }
                const spoken = overlay.words?.find((word) => time >= word.startMs && time <= word.endMs);
                const text =
                  overlay.type === "caption" && wordHighlight && overlay.words?.length ? (
                    overlay.words.map((word, index) => (
                      <span key={`${overlay.id}-w-${index}`} className={spoken?.startMs === word.startMs ? "bg-yellow-300 text-black" : undefined}>
                        {word.text}
                        {index < overlay.words!.length - 1 ? " " : ""}
                      </span>
                    ))
                  ) : overlay.type === "caption" && wordHighlight ? (
                    overlay.text.split(" ").slice(0, maxWords).join(" ")
                  ) : (
                    overlay.text
                  );
                return (
                  <div
                    key={overlay.id}
                    className="absolute px-2 py-1"
                    style={{
                      left: overlay.alignment === "center" ? 0 : overlay.alignment === "right" ? undefined : `${(overlay.x / size.w) * 100}%`,
                      right: overlay.alignment === "right" ? 8 : undefined,
                      width: overlay.alignment === "center" ? "100%" : undefined,
                      top: `${(overlay.y / size.h) * 100}%`,
                      color: overlay.color,
                      background: overlay.background ?? undefined,
                      fontSize: Math.max(10, overlay.fontSize * (260 / size.w)),
                      fontWeight: overlay.fontWeight,
                      textAlign: overlay.alignment,
                    }}
                  >
                    {text}
                  </div>
                );
              })}
            </div>
          </div>
          <VideoControls
            playing={playing}
            onPlayPause={() => setPlaying((value) => !value)}
            currentMs={time}
            durationMs={durationMs}
            onSeek={(ms) => {
              setTime(Math.min(canvas.trimEndMs, Math.max(canvas.trimStartMs, ms)));
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
        </section>

        <aside className="overflow-auto rounded-lg border bg-card p-3 text-[12px]">
          <p className="mb-2 font-medium">{TOOLS.find((item) => item.id === tool)?.label}</p>
          {tool === "Media" && (
            <div className="space-y-2">
              <p className="text-muted-foreground">Arquivo do clip.</p>
              <label className="block rounded-md border border-dashed px-2 py-4 text-center">
                Logo / imagem
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="mt-2 block w-full text-[11px]"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void onLogo(file);
                  }}
                />
              </label>
              <div className="space-y-1">
                <label>
                  Scale {canvas.scale.toFixed(2)}
                  <input
                    type="range"
                    min={0.5}
                    max={2}
                    step={0.05}
                    value={canvas.scale}
                    onChange={(e) => {
                      pushHistory();
                      setCanvas((c) => ({ ...c, scale: Number(e.target.value) }));
                    }}
                    className="w-full"
                  />
                </label>
                <label>
                  Posição X
                  <input
                    type="number"
                    value={canvas.offsetX}
                    onChange={(e) => setCanvas((c) => ({ ...c, offsetX: Number(e.target.value) }))}
                    className="mt-1 h-8 w-full rounded-md border bg-transparent px-2"
                  />
                </label>
                <label>
                  Posição Y
                  <input
                    type="number"
                    value={canvas.offsetY}
                    onChange={(e) => setCanvas((c) => ({ ...c, offsetY: Number(e.target.value) }))}
                    className="mt-1 h-8 w-full rounded-md border bg-transparent px-2"
                  />
                </label>
                <p className="text-muted-foreground">Crop (px no canvas canônico)</p>
                {["x", "y", "w", "h"].map((field) => (
                  <label key={field} className="block">
                    {field}
                    <input
                      type="number"
                      value={canvas.crop?.[field as "x" | "y" | "w" | "h"] ?? ""}
                      onChange={(e) => {
                        const next = { x: 0, y: 0, w: size.w, h: size.h, ...(canvas.crop ?? {}) };
                        next[field as "x" | "y" | "w" | "h"] = Number(e.target.value) || 0;
                        setCanvas((c) => ({ ...c, crop: next }));
                      }}
                      className="mt-1 h-8 w-full rounded-md border bg-transparent px-2"
                    />
                  </label>
                ))}
                <Button size="xs" variant="outline" type="button" onClick={() => setCanvas((c) => ({ ...c, crop: null }))}>
                  Limpar crop
                </Button>
              </div>
            </div>
          )}
          {tool === "Text" && (
            <div className="space-y-2">
              <Button size="sm" type="button" onClick={() => addOverlay("text")}>
                Adicionar texto
              </Button>
              {selected?.type === "text" ? <OverlayFields overlay={selected} onChange={(patch) => updateOverlay(selected.id, patch)} durationMs={durationMs} /> : <p className="text-muted-foreground">Selecione um texto na lista.</p>}
              <OverlayList overlays={canvas.overlays.filter((item) => item.type === "text")} selectedId={selectedId} onSelect={setSelectedId} />
            </div>
          )}
          {tool === "Captions" && (
            <div className="space-y-2">
              <label className="block">
                Preset
                <select
                  className="mt-1 h-8 w-full rounded-md border bg-transparent px-2"
                  value={captionPreset}
                  onChange={(e) => {
                    const name = e.target.value;
                    const style = getCaptionPreset(name);
                    setCaptionPreset(name);
                    setWordHighlight(style.wordHighlight);
                    setMaxWords(style.maxWordsPerLine);
                    pushHistory();
                    setCanvas((current) => ({
                      ...current,
                      overlays: current.overlays.map((overlay) =>
                        overlay.type === "caption"
                          ? {
                              ...overlay,
                              fontSize: style.fontSize,
                              fontWeight: style.fontWeight,
                              color: style.color,
                              background: style.background,
                              alignment: style.alignment,
                              y: captionY(style.position, size.h),
                            }
                          : overlay,
                      ),
                    }));
                  }}
                >
                  {CAPTION_PRESET_IDS.map((item) => (
                    <option key={item}>{item}</option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={wordHighlight} onChange={(e) => setWordHighlight(e.target.checked)} />
                Palavras destacadas
              </label>
              <label className="block">
                Máx. palavras por linha
                <input
                  type="number"
                  min={1}
                  max={12}
                  value={maxWords}
                  onChange={(e) => setMaxWords(Number(e.target.value) || 6)}
                  className="mt-1 h-8 w-full rounded-md border bg-transparent px-2"
                />
              </label>
              <Button size="sm" type="button" onClick={() => addOverlay("caption")}>
                Nova caption
              </Button>
              <OverlayList overlays={canvas.overlays.filter((item) => item.type === "caption")} selectedId={selectedId} onSelect={setSelectedId} />
              {selected?.type === "caption" ? (
                <OverlayFields overlay={selected} onChange={(patch) => updateOverlay(selected.id, patch)} durationMs={durationMs} />
              ) : (
                <p className="text-muted-foreground">Preview: {activeCaption || "—"}</p>
              )}
            </div>
          )}
          {tool === "Layouts" && (
            <div className="grid grid-cols-2 gap-2">
              {["9:16", "16:9", "1:1", "4:5"].map((item) => (
                <button
                  key={item}
                  type="button"
                  className={`rounded-md border py-6 ${ratio === item ? "border-primary bg-primary/10" : ""}`}
                  onClick={() => {
                    pushHistory();
                    setRatio(item);
                  }}
                >
                  {item}
                </button>
              ))}
            </div>
          )}
          {tool === "Templates" && (
            <div className="space-y-2">
              {templates.length === 0 ? (
                <p className="text-muted-foreground">Nenhum template neste workspace.</p>
              ) : (
                templates.map((template) => (
                  <form key={template.id} action={applyTemplateAction}>
                    <input type="hidden" name="templateId" value={template.id} />
                    <input type="hidden" name="clipIds" value={clipId} />
                    <Button type="submit" size="sm" variant={appliedTemplateId === template.id ? "default" : "outline"} className="w-full justify-start">
                      {template.name}
                    </Button>
                  </form>
                ))
              )}
            </div>
          )}
          {tool === "Brand" && (
            <div className="space-y-2">
              <label className="block">
                Título
                <input
                  value={clipTitle}
                  onChange={(event) => setClipTitle(event.target.value.slice(0, 120))}
                  className="mt-1 h-8 w-full rounded-md border bg-transparent px-2"
                />
              </label>
              <label className="block">
                Caption
                <textarea
                  value={clipCaption}
                  onChange={(event) => setClipCaption(event.target.value)}
                  className="mt-1 h-24 w-full rounded-md border bg-transparent px-2 py-1"
                />
              </label>
              <label className="block">
                Hashtags
                <input
                  value={clipHashtags}
                  onChange={(event) => setClipHashtags(event.target.value)}
                  className="mt-1 h-8 w-full rounded-md border bg-transparent px-2"
                />
              </label>
            </div>
          )}
          {tool !== "Captions" && tool !== "Layouts" && tool !== "Templates" && tool !== "Media" && tool !== "Text" && tool !== "Brand" && (
            <p className="text-muted-foreground">Ajuste o recorte e as legendas no painel.</p>
          )}
        </aside>
      </div>

      <div className="mt-2 rounded-lg border bg-card p-2">
        <div className="mb-2 grid grid-cols-2 gap-3 text-[11px]">
          <label>
            Trim início {(canvas.trimStartMs / 1000).toFixed(1)}s
            <input
              type="range"
              min={0}
              max={durationMs}
              value={canvas.trimStartMs}
              onChange={(e) => {
                const value = Number(e.target.value);
                setCanvas((c) => ({ ...c, trimStartMs: Math.min(value, c.trimEndMs - 200) }));
              }}
              className="w-full"
            />
          </label>
          <label>
            Trim fim {(canvas.trimEndMs / 1000).toFixed(1)}s
            <input
              type="range"
              min={0}
              max={durationMs}
              value={canvas.trimEndMs}
              onChange={(e) => {
                const value = Number(e.target.value);
                setCanvas((c) => ({ ...c, trimEndMs: Math.max(value, c.trimStartMs + 200) }));
              }}
              className="w-full"
            />
          </label>
        </div>
        <p className="mb-1 text-[11px] text-muted-foreground">Timeline</p>
        {["Vídeo", "Legendas", "Texto"].map((track) => (
          <div key={track} className="mb-1 flex items-center gap-2">
            <span className="w-16 text-[11px] text-muted-foreground">{track}</span>
            <div className="relative h-5 flex-1 rounded bg-muted">
              <div
                className="absolute top-0 h-full rounded bg-primary/40"
                style={{
                  left: `${(canvas.trimStartMs / Math.max(1, durationMs)) * 100}%`,
                  width: `${((canvas.trimEndMs - canvas.trimStartMs) / Math.max(1, durationMs)) * 100}%`,
                }}
              />
              <div className="absolute top-0 h-full w-px bg-primary" style={{ left: `${Math.min(100, progress)}%` }} />
            </div>
          </div>
        ))}
        <div className="mt-1 flex items-center justify-between gap-3">
          <div>
            <span className="text-[11px] text-muted-foreground">Zoom</span>
            <Slider value={[zoom]} onValueChange={(v) => setZoom(v[0] ?? 100)} min={50} max={160} className="w-40" />
          </div>
          <span className="text-[11px] text-muted-foreground">
            {formatEditorTime(time)} / {formatEditorTime(durationMs)}
          </span>
        </div>
      </div>

      <Dialog open={exportOpen} onOpenChange={setExportOpen}>
        <DialogContent className="max-w-sm">
          <DialogTitle>Exportar vídeo</DialogTitle>
          <p className="text-[13px] text-muted-foreground">Formato MP4</p>
          <div className="grid grid-cols-2 gap-2">
            {(maxResolution === "720p" ? (["720p"] as const) : (["720p", "1080p"] as const)).map((item) => (
              <button
                key={item}
                type="button"
                className={`rounded-xl border py-3 text-[13px] ${exportResolution === item ? "border-primary bg-primary/10" : ""}`}
                onClick={() => setExportResolution(item)}
              >
                {item}
              </button>
            ))}
          </div>
          <Button
            type="button"
            disabled={exporting}
            onClick={() => {
              setExportOpen(false);
              void handleExport();
            }}
          >
            {exporting ? "Exportando..." : "Exportar vídeo"}
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function formatEditorTime(ms: number) {
  const total = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

function OverlayList({
  overlays,
  selectedId,
  onSelect,
}: {
  overlays: EditorOverlay[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  if (overlays.length === 0) return <p className="text-muted-foreground">Nenhum item.</p>;
  return (
    <ul className="max-h-32 space-y-1 overflow-auto">
      {overlays.map((item) => (
        <li key={item.id}>
          <button
            type="button"
            className={`w-full truncate rounded px-2 py-1 text-left ${selectedId === item.id ? "bg-muted" : "hover:bg-muted/50"}`}
            onClick={() => onSelect(item.id)}
          >
            {item.text || item.storageKey || item.type}
          </button>
        </li>
      ))}
    </ul>
  );
}

function OverlayFields({
  overlay,
  onChange,
  durationMs,
}: {
  overlay: EditorOverlay;
  onChange: (patch: Partial<EditorOverlay>) => void;
  durationMs: number;
}) {
  return (
    <div className="space-y-1.5">
      <textarea
        value={overlay.text}
        onChange={(e) => onChange({ text: e.target.value })}
        className="h-16 w-full rounded-md border bg-transparent px-2 py-1"
      />
      <label className="block">
        Início ms
        <input type="number" value={overlay.startMs} min={0} max={durationMs} onChange={(e) => onChange({ startMs: Number(e.target.value) })} className="mt-1 h-8 w-full rounded-md border bg-transparent px-2" />
      </label>
      <label className="block">
        Fim ms
        <input type="number" value={overlay.endMs} min={0} max={durationMs} onChange={(e) => onChange({ endMs: Number(e.target.value) })} className="mt-1 h-8 w-full rounded-md border bg-transparent px-2" />
      </label>
      <label className="block">
        X
        <input type="number" value={overlay.x} onChange={(e) => onChange({ x: Number(e.target.value) })} className="mt-1 h-8 w-full rounded-md border bg-transparent px-2" />
      </label>
      <label className="block">
        Y
        <input type="number" value={overlay.y} onChange={(e) => onChange({ y: Number(e.target.value) })} className="mt-1 h-8 w-full rounded-md border bg-transparent px-2" />
      </label>
      <label className="block">
        Tamanho da fonte
        <input type="number" value={overlay.fontSize} onChange={(e) => onChange({ fontSize: Number(e.target.value) })} className="mt-1 h-8 w-full rounded-md border bg-transparent px-2" />
      </label>
      <label className="block">
        Peso
        <input type="number" value={overlay.fontWeight} step={100} min={400} max={900} onChange={(e) => onChange({ fontWeight: Number(e.target.value) })} className="mt-1 h-8 w-full rounded-md border bg-transparent px-2" />
      </label>
      <label className="block">
        Cor
        <input type="color" value={overlay.color} onChange={(e) => onChange({ color: e.target.value })} className="mt-1 h-8 w-full" />
      </label>
      <label className="block">
        Fundo
        <input type="color" value={overlay.background ?? "#000000"} onChange={(e) => onChange({ background: e.target.value })} className="mt-1 h-8 w-full" />
      </label>
      <label className="block">
        Alinhamento
        <select value={overlay.alignment} onChange={(e) => onChange({ alignment: e.target.value as EditorOverlay["alignment"] })} className="mt-1 h-8 w-full rounded-md border bg-transparent px-2">
          <option value="left">left</option>
          <option value="center">center</option>
          <option value="right">right</option>
        </select>
      </label>
    </div>
  );
}
