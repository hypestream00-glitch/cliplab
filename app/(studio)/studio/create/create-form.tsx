"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { formatBytes, formatDuration } from "@/lib/utils/format";
import { friendlyError } from "@/lib/ui/friendly-error";
import { cn } from "@/lib/utils";
import { CloudUpload, Loader2, Minus, Plus, Sparkles, Globe, Zap, Clock, Circle, Smartphone, Square, Monitor } from "lucide-react";

const MODES = [
  { value: "AUTOMATIC", label: "Automático" },
  { value: "VIRAL", label: "Viral" },
  { value: "PODCAST", label: "Podcast" },
  { value: "GAMING", label: "Games" },
  { value: "HIGHLIGHTS", label: "Melhores momentos" },
  { value: "HUMOR", label: "Humor" },
  { value: "INFORMATIVE", label: "Informativo" },
] as const;

type FileMeta = {
  name: string;
  size: number;
  durationMs?: number;
  width?: number;
  height?: number;
  preview?: string;
};

type UploadPhase = "idle" | "preparing" | "uploading" | "uploaded" | "validating" | "processing" | "error";

const SESSION_KEY = "cliplab:create-upload";

function formPayload(form: HTMLFormElement, filename: string) {
  const data = new FormData(form);
  const name = String(data.get("name") ?? "").trim();
  return {
    name: name && name !== "Novo projeto" ? name : filename.replace(/\.[^.]+$/, "").slice(0, 80) || "Novo projeto",
    sourceKind: "UPLOAD" as const,
    sourceUrl: "",
    language: String(data.get("language") || "pt-BR"),
    intervalSeconds: Number(data.get("intervalSeconds") || 0),
    clipDuration: String(data.get("clipDuration") || "15-30"),
    clipCount: Number(data.get("clipCount") || 5),
    mode: String(data.get("mode") || "AUTOMATIC"),
    detectSpeakers: data.get("detectSpeakers") === "on",
    removeSilences: data.get("removeSilences") === "on",
    autoReframe: data.get("autoReframe") === "on",
    autoCaptions: data.get("autoCaptions") === "on",
    viralScore: data.get("viralScore") === "on",
    generateTitle: data.get("generateTitle") === "on",
    generateDescription: data.get("generateDescription") === "on",
    generateHashtags: data.get("generateHashtags") === "on",
    authorized: true,
    outputAspect: String(data.get("outputAspect") || "9:16"),
  };
}

function putFile(url: string, file: File, headers: Record<string, string>, onProgress: (pct: number) => void, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    for (const [key, value] of Object.entries(headers)) {
      if (value) xhr.setRequestHeader(key, value);
    }
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) {
        onProgress(Math.min(100, Math.round((event.loaded / event.total) * 100)));
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(xhr.status === 0 ? "Falha de rede ou CORS no storage." : `Falha no envio (${xhr.status}).`));
    };
    xhr.onerror = () => reject(new Error("Falha de rede ou CORS no storage."));
    xhr.onabort = () => reject(new Error("Upload cancelado."));
    signal.addEventListener("abort", () => xhr.abort());
    xhr.send(file);
  });
}

export function CreateProjectForm({
  maxClipsPerProject = 5,
}: {
  maxClipsPerProject?: number;
}) {
  const router = useRouter();
  const [advanced, setAdvanced] = useState(false);
  const [sourceTab, setSourceTab] = useState<"file" | "link">("file");
  const [clipCount, setClipCount] = useState(Math.min(5, maxClipsPerProject));
  const [duration, setDuration] = useState("15-30");
  const [aspect, setAspect] = useState("9:16");
  const [fileMeta, setFileMeta] = useState<FileMeta | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [phase, setPhase] = useState<UploadPhase>("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const uploadIdRef = useRef<string | null>(null);
  const phaseRef = useRef<UploadPhase>("idle");

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  useEffect(() => {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return;
    let parsed: { uploadId?: string; projectId?: string };
    try {
      parsed = JSON.parse(raw) as { uploadId?: string; projectId?: string };
    } catch {
      sessionStorage.removeItem(SESSION_KEY);
      return;
    }
    if (parsed.projectId) {
      router.replace(`/studio/projects/${parsed.projectId}`);
      return;
    }
    if (!parsed.uploadId) return;
    void (async () => {
      const res = await fetch(`/api/uploads/${parsed.uploadId}`);
      if (!res.ok) {
        sessionStorage.removeItem(SESSION_KEY);
        return;
      }
      const body = (await res.json()) as {
        status?: string;
        projectId?: string | null;
        errorMessage?: string | null;
      };
      if (body.projectId) {
        sessionStorage.setItem(SESSION_KEY, JSON.stringify({ projectId: body.projectId }));
        router.replace(`/studio/projects/${body.projectId}`);
        return;
      }
      if (body.status === "FAILED" || body.status === "EXPIRED") {
        sessionStorage.removeItem(SESSION_KEY);
        setPhase("error");
        setError(body.errorMessage || "O envio anterior falhou. Selecione o arquivo e tente de novo.");
        return;
      }
      if (body.status === "PENDING" || body.status === "UPLOADING") {
        setError("O envio foi interrompido. Selecione o arquivo novamente para continuar.");
      }
    })();
  }, [router]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      const id = uploadIdRef.current;
      if (id && (phaseRef.current === "preparing" || phaseRef.current === "uploading")) {
        void fetch(`/api/uploads/${id}`, { method: "DELETE", keepalive: true }).catch(() => undefined);
      }
    };
  }, []);

  useEffect(() => {
    if (phase !== "uploading") return;
    const onLeave = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onLeave);
    return () => window.removeEventListener("beforeunload", onLeave);
  }, [phase]);

  function readFile(file: File | undefined) {
    if (!file) {
      setFileMeta(null);
      return;
    }
    const next: FileMeta = { name: file.name, size: file.size };
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.src = url;
    video.onloadedmetadata = () => {
      next.durationMs = Math.round(video.duration * 1000);
      next.width = video.videoWidth;
      next.height = video.videoHeight;
      video.currentTime = Math.min(1, video.duration / 4 || 0);
    };
    video.onseeked = () => {
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth || 360;
      canvas.height = video.videoHeight || 640;
      const ctx = canvas.getContext("2d");
      ctx?.drawImage(video, 0, 0, canvas.width, canvas.height);
      next.preview = canvas.toDataURL("image/jpeg", 0.7);
      setFileMeta({ ...next });
      URL.revokeObjectURL(url);
    };
    setFileMeta(next);
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const form = event.currentTarget;
    if (!(form.elements.namedItem("authorized") as HTMLInputElement | null)?.checked) {
      setError("Confirme a autorização de uso.");
      return;
    }
    const file = inputRef.current?.files?.[0];
    if (!file || file.size <= 0) {
      setError("Selecione um arquivo MP4, MOV ou WEBM.");
      return;
    }
    abortRef.current?.abort();
    const abort = new AbortController();
    abortRef.current = abort;
    setPhase("preparing");
    setProgress(0);
    try {
      const previous = sessionStorage.getItem(SESSION_KEY);
      if (previous) {
        try {
          const parsed = JSON.parse(previous) as { uploadId?: string; projectId?: string };
          if (parsed.uploadId && !parsed.projectId) {
            await fetch(`/api/uploads/${parsed.uploadId}`, { method: "DELETE" }).catch(() => undefined);
          }
        } catch {
          /* ignore stale sessionStorage */
        }
      }
      const initRes = await fetch("/api/uploads/init", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: file.name, contentType: file.type, fileSize: file.size }),
      });
      const initBody = (await initRes.json()) as {
        error?: string;
        uploadId?: string;
        url?: string;
        headers?: Record<string, string>;
      };
      if (!initRes.ok || !initBody.uploadId || !initBody.url) {
        throw new Error(initBody.error || "Não foi possível iniciar o upload.");
      }
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({ uploadId: initBody.uploadId }));
      uploadIdRef.current = initBody.uploadId;
      setPhase("uploading");
      await putFile(initBody.url, file, initBody.headers ?? { "Content-Type": file.type || "video/mp4" }, setProgress, abort.signal);
      setProgress(100);
      setPhase("uploaded");
      setPhase("validating");
      const completeRes = await fetch(`/api/uploads/${initBody.uploadId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formPayload(form, file.name)),
      });
      let completeBody = (await completeRes.json()) as { error?: string; projectId?: string };
      if (completeRes.status === 409 && initBody.uploadId) {
        for (let attempt = 0; attempt < 20 && !completeBody.projectId; attempt += 1) {
          await new Promise((resolve) => setTimeout(resolve, 500));
          const statusRes = await fetch(`/api/uploads/${initBody.uploadId}`);
          const statusBody = (await statusRes.json()) as {
            status?: string;
            projectId?: string | null;
            errorMessage?: string | null;
          };
          if (statusBody.projectId) {
            completeBody = { projectId: statusBody.projectId };
            break;
          }
          if (statusBody.status === "FAILED" || statusBody.status === "EXPIRED") {
            throw new Error(statusBody.errorMessage || "Não foi possível validar o upload.");
          }
        }
      }
      if (!completeBody.projectId) {
        throw new Error(completeBody.error || "Não foi possível validar o upload.");
      }
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({ projectId: completeBody.projectId }));
      uploadIdRef.current = null;
      setPhase("processing");
      router.push(`/studio/projects/${completeBody.projectId}`);
    } catch (err) {
      if (abort.signal.aborted) return;
      setPhase("error");
      setError(friendlyError(err instanceof Error ? err.message : "Falha no upload."));
    }
  }

  const busy = phase === "preparing" || phase === "uploading" || phase === "uploaded" || phase === "validating" || phase === "processing";
  const statusLabel =
    phase === "preparing"
      ? "Preparando upload"
      : phase === "uploading"
        ? `Enviando vídeo ${progress}%`
        : phase === "uploaded"
          ? "Upload concluído"
          : phase === "validating"
            ? "Validando vídeo"
            : phase === "processing"
              ? "Na fila"
              : phase === "idle" && fileMeta
                ? "Selecionado"
                : phase === "error"
                  ? "Erro no envio"
                  : null;

  async function cancelUpload() {
    abortRef.current?.abort();
    const id = uploadIdRef.current;
    uploadIdRef.current = null;
    if (id) await fetch(`/api/uploads/${id}`, { method: "DELETE" }).catch(() => undefined);
    sessionStorage.removeItem(SESSION_KEY);
    setPhase("error");
    setError("Upload cancelado. O envio foi interrompido e nada foi processado.");
  }

  return (
    <form onSubmit={onSubmit} className="mx-auto max-w-[880px] space-y-8">
      <div className="flex gap-2">
        <button
          type="button"
          className={cn(
            "h-10 rounded-xl border px-4 text-[13px] font-medium",
            sourceTab === "file" ? "border-magenta/50 bg-magenta/10 text-white" : "text-text-secondary",
          )}
          onClick={() => setSourceTab("file")}
        >
          Arquivo
        </button>
        <button
          type="button"
          className="h-10 rounded-xl border px-4 text-[13px] font-medium text-text-secondary"
          disabled
          aria-disabled="true"
          title="Em breve"
        >
          Link <span className="ml-1 rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase">Em breve</span>
        </button>
      </div>

      <label
        className={cn(
          "relative flex min-h-[380px] cursor-pointer flex-col items-center justify-center overflow-hidden rounded-3xl bg-[#07070a] px-8 py-10 text-center gradient-border",
          dragOver && "bg-magenta/5",
        )}
        onDragOver={(event) => {
          event.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragOver(false);
          const file = event.dataTransfer.files[0];
          if (!file || !inputRef.current) return;
          const transfer = new DataTransfer();
          transfer.items.add(file);
          inputRef.current.files = transfer.files;
          readFile(file);
        }}
      >
        <span className="pointer-events-none absolute inset-y-0 left-0 w-36 opacity-70" aria-hidden>
          <svg viewBox="0 0 140 340" className="h-full w-full">
            <defs>
              <linearGradient id="waveL" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#E92ACB" stopOpacity="0.45" />
                <stop offset="100%" stopColor="#8B3DFF" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d="M0 40 C40 80 20 140 48 180 C70 214 10 250 0 300 Z" fill="url(#waveL)" />
            <circle cx="18" cy="90" r="58" fill="#E92ACB" fillOpacity="0.16" />
          </svg>
        </span>
        <span className="pointer-events-none absolute inset-y-0 right-0 w-36 opacity-70" aria-hidden>
          <svg viewBox="0 0 140 340" className="h-full w-full">
            <defs>
              <linearGradient id="waveR" x1="1" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#2563EB" stopOpacity="0.45" />
                <stop offset="100%" stopColor="#8B3DFF" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d="M140 50 C100 90 122 150 92 190 C70 224 130 260 140 310 Z" fill="url(#waveR)" />
            <circle cx="122" cy="240" r="62" fill="#2563EB" fillOpacity="0.16" />
          </svg>
        </span>
        {fileMeta ? (
          <div className="relative z-10 flex w-full max-w-md items-center gap-4 text-left">
            {fileMeta.preview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={fileMeta.preview} alt="" className="h-28 w-16 rounded-lg object-cover" />
            ) : (
              <div className="h-28 w-16 rounded-lg bg-muted" />
            )}
            <div className="min-w-0">
              <p className="truncate text-[14px] font-medium">{fileMeta.name}</p>
              <p className="mt-1 text-[13px] text-text-secondary">
                {formatBytes(fileMeta.size)}
                {fileMeta.durationMs ? ` · ${formatDuration(fileMeta.durationMs)}` : ""}
                {fileMeta.width && fileMeta.height ? ` · ${fileMeta.width}×${fileMeta.height}` : ""}
              </p>
              {statusLabel ? <p className="mt-2 text-[12px] text-primary">{statusLabel}</p> : <p className="mt-2 text-[12px] text-text-secondary">Clique para trocar o arquivo</p>}
              {phase === "uploading" ? (
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                  <div className="h-full gradient-brand transition-[width]" style={{ width: `${progress}%` }} />
                </div>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="relative z-10">
            <CloudUpload className="mx-auto size-12 text-purple" aria-hidden />
            <p className="mt-4 text-[18px] font-medium text-white">Arraste seu vídeo aqui</p>
            <p className="mt-1 text-[14px] text-text-secondary">ou</p>
            <span className="mt-4 inline-flex h-11 items-center rounded-xl gradient-brand px-5 text-[14px] font-semibold text-white">
              Selecionar vídeo
            </span>
            <p className="mt-4 text-[12px] text-text-secondary">MP4, MOV ou WEBM — envio direto ao storage</p>
          </div>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="video/mp4,video/webm,video/quicktime,.mp4,.mov,.webm"
          className="sr-only"
          disabled={busy}
          onChange={(event) => readFile(event.target.files?.[0])}
        />
        <input type="hidden" name="sourceKind" value="UPLOAD" />
      </label>

      <div className="rounded-3xl p-7 gradient-border-config sm:p-8">
        <p className="text-[17px] font-semibold text-white">Configurações de criação</p>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className={cn("cursor-pointer rounded-2xl border p-5", !advanced && "border-magenta bg-magenta/10 glow-primary")}>
            <input type="radio" name="experience" className="sr-only" defaultChecked onChange={() => setAdvanced(false)} />
            <span className="flex items-start justify-between gap-2">
              <span className="flex items-center gap-2.5">
                <span className={cn("mt-0.5 flex size-4 items-center justify-center rounded-full border-2", !advanced ? "border-magenta" : "border-border")}>
                  {!advanced ? <span className="size-2 rounded-full bg-magenta" /> : null}
                </span>
                <span className="text-[15px] font-medium text-white">🤖 Modo automático</span>
              </span>
              <span className="rounded-md border border-gold/40 bg-gold/15 px-1.5 py-0.5 text-[10px] font-semibold text-gold">★ RECOMENDADO</span>
            </span>
            <span className="mt-2 block pl-7 text-[13px] leading-5 text-text-secondary">
              A IA escolhe automaticamente os melhores momentos e configura os clips.
            </span>
          </label>
          <label className={cn("cursor-pointer rounded-2xl border border-border bg-surface p-5", advanced && "border-magenta bg-magenta/10 glow-primary")}>
            <input type="radio" name="experience" className="sr-only" onChange={() => setAdvanced(true)} />
            <span className="flex items-center gap-2.5">
              <span className={cn("flex size-4 items-center justify-center rounded-full border-2", advanced ? "border-magenta" : "border-border")}>
                {advanced ? <span className="size-2 rounded-full bg-magenta" /> : null}
              </span>
              <span className="text-[15px] font-medium text-white">Personalizar</span>
            </span>
            <span className="mt-2 block pl-7 text-[13px] leading-5 text-text-secondary">Ajuste todas as preferências manualmente.</span>
          </label>
        </div>

        {!advanced ? (
          <>
            <div className="mt-6 space-y-6">
              <div>
                <p className="text-[13px] font-medium text-white">Quantidade de clips (máx. {maxClipsPerProject})</p>
                <div className="mt-3 flex items-center justify-center">
                  <div className="inline-flex items-center gap-1 rounded-2xl border border-border bg-surface p-1.5">
                    <button
                      type="button"
                      className="flex size-11 items-center justify-center rounded-xl text-white hover:bg-surface-hover"
                      aria-label="Diminuir quantidade"
                      onClick={() => setClipCount((value) => Math.max(1, value - 1))}
                    >
                      <Minus className="size-4" />
                    </button>
                    <span className="w-12 text-center text-[24px] font-semibold text-white">{clipCount}</span>
                    <button
                      type="button"
                      className="flex size-11 items-center justify-center rounded-xl text-white hover:bg-surface-hover"
                      aria-label="Aumentar quantidade"
                      onClick={() => setClipCount((value) => Math.min(maxClipsPerProject, value + 1))}
                    >
                      <Plus className="size-4" />
                    </button>
                  </div>
                </div>
                <input type="hidden" name="clipCount" value={clipCount} />
              </div>
              <div className="space-y-2">
                <label htmlFor="languageSimple" className="text-[13px] font-medium text-white">
                  Idioma
                </label>
                <div className="relative">
                  <Globe className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-blue" />
                  <select id="languageSimple" name="language" className="studio-select pl-10" defaultValue="auto">
                    <option value="auto">Detectar automaticamente</option>
                    <option value="pt-BR">Português (Brasil)</option>
                    <option value="en">English</option>
                    <option value="es">Español</option>
                  </select>
                </div>
              </div>
              <div>
                <p className="text-[13px] font-medium text-white">Duração</p>
                <div className="mt-3 grid grid-cols-3 gap-3 text-[13px]">
                  {(
                    [
                      { value: "15-30", label: "Curto", hint: "15–30s", Icon: Zap },
                      { value: "30-60", label: "Médio", hint: "30–60s", Icon: Clock },
                      { value: "60-90", label: "Longo", hint: "60–90s", Icon: Circle },
                    ] as const
                  ).map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      className={cn(
                        "rounded-2xl border px-3 py-4 text-left",
                        duration === option.value ? "border-magenta bg-purple/20 glow-primary" : "border-border bg-surface",
                      )}
                      aria-pressed={duration === option.value}
                      onClick={() => setDuration(option.value)}
                    >
                      <span className="flex items-center gap-1.5 font-medium text-white">
                        <option.Icon className={cn("size-3.5", duration === option.value ? "text-magenta" : "text-text-secondary")} />
                        {option.label}
                      </span>
                      <span className="mt-1 block text-[12px] text-text-secondary">{option.hint}</span>
                    </button>
                  ))}
                </div>
                <input type="hidden" name="clipDuration" value={duration} />
              </div>
              <div>
                <p className="text-[13px] font-medium text-white">Formato</p>
                <div className="mt-3 grid grid-cols-3 gap-3 text-[13px]">
                  {(
                    [
                      { value: "9:16", label: "Vertical 9:16", Icon: Smartphone },
                      { value: "1:1", label: "Quadrado 1:1", Icon: Square },
                      { value: "16:9", label: "Horizontal 16:9", Icon: Monitor },
                    ] as const
                  ).map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      className={cn(
                        "rounded-2xl border px-3 py-4",
                        aspect === option.value ? "border-magenta bg-purple/20 glow-primary" : "border-border bg-surface",
                      )}
                      aria-pressed={aspect === option.value}
                      onClick={() => setAspect(option.value)}
                    >
                      <span className="flex flex-col items-center gap-1.5 text-center font-medium text-white">
                        <option.Icon className={cn("size-4", aspect === option.value ? "text-magenta" : "text-text-secondary")} />
                        {option.label}
                      </span>
                    </button>
                  ))}
                </div>
                <input type="hidden" name="outputAspect" value={aspect} />
              </div>
              <label className="flex items-center gap-2.5 text-[14px] text-white">
                <input type="checkbox" name="autoCaptions" defaultChecked className="size-4 accent-[#e92acb]" />
                Legendas automáticas
                <span className="rounded border border-gold/50 px-1.5 py-0.5 text-[10px] font-semibold text-gold">CC</span>
              </label>
            </div>
            <input type="hidden" name="mode" value="AUTOMATIC" />
            <input type="hidden" name="detectSpeakers" value="on" />
            <input type="hidden" name="removeSilences" value="on" />
            <input type="hidden" name="autoReframe" value="on" />
            <input type="hidden" name="viralScore" value="on" />
            <input type="hidden" name="generateTitle" value="on" />
            <input type="hidden" name="generateDescription" value="on" />
            <input type="hidden" name="generateHashtags" value="on" />
          </>
        ) : (
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <label htmlFor="name" className="text-[13px] font-medium">Nome do projeto</label>
              <Input id="name" name="name" placeholder="Opcional — usamos o nome do arquivo" />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="language" className="text-[13px] font-medium">Idioma</label>
              <select id="language" name="language" className="studio-select" defaultValue="auto">
                <option value="auto">Detectar automaticamente</option>
                <option value="pt-BR">Português (Brasil)</option>
                <option value="en">English</option>
                <option value="es">Español</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="clipCount" className="text-[13px] font-medium">Quantidade de clips (máx. {maxClipsPerProject})</label>
              <Input id="clipCount" name="clipCount" type="number" defaultValue={maxClipsPerProject} min={1} max={maxClipsPerProject} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <p className="text-[13px] font-medium">Duração desejada</p>
              <div className="grid grid-cols-2 gap-2 text-[13px] sm:grid-cols-4">
                {["15-30", "30-60", "60-90", "90+"].map((value) => (
                  <label key={value} className="flex items-center gap-2 rounded-lg border px-2 py-1.5">
                    <input type="radio" name="clipDuration" value={value} defaultChecked={value === "15-30"} />
                    {value === "90+" ? "até 90s" : `${value}s`}
                  </label>
                ))}
              </div>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <p className="text-[13px] font-medium">Formato</p>
              <div className="grid grid-cols-3 gap-2 text-[13px]">
                {["9:16", "1:1", "16:9"].map((value) => (
                  <label key={value} className="flex items-center gap-2 rounded-lg border px-2 py-1.5">
                    <input type="radio" name="outputAspect" value={value} defaultChecked={value === "9:16"} />
                    {value}
                  </label>
                ))}
              </div>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <label htmlFor="mode" className="text-[13px] font-medium">Estilo</label>
              <select id="mode" name="mode" className="studio-select" defaultValue="AUTOMATIC">
                {MODES.map((mode) => (
                  <option key={mode.value} value={mode.value}>
                    {mode.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-2 text-[13px] sm:col-span-2">
              {[
                ["detectSpeakers", "Detectar speakers"],
                ["removeSilences", "Remover silêncios"],
                ["autoReframe", "Reenquadramento"],
                ["autoCaptions", "Legendas"],
                ["viralScore", "Score"],
                ["generateTitle", "Título"],
                ["generateDescription", "Descrição"],
                ["generateHashtags", "Hashtags"],
              ].map(([name, label]) => (
                <label key={name} className="flex items-center gap-2">
                  <input type="checkbox" name={name} defaultChecked className="size-3.5 accent-[#e92acb]" />
                  {label}
                </label>
              ))}
            </div>
          </div>
        )}
      </div>

      <label className="flex items-start gap-2.5 text-[14px] text-white">
        <input type="checkbox" name="authorized" required className="mt-0.5 size-4 accent-[#e92acb]" />
        Confirmo que tenho autorização para utilizar este conteúdo.
      </label>
      {error ? (
        <p className="text-[13px] text-destructive">
          {error} {phase === "error" ? "Você pode tentar novamente com o mesmo arquivo." : ""}
        </p>
      ) : null}
      <button
        type="submit"
        className="inline-flex h-16 w-full items-center justify-center gap-2 rounded-2xl gradient-brand text-[16px] font-semibold text-white shadow-[0_0_28px_rgba(139,61,255,0.28)] glow-primary transition hover:opacity-90 disabled:opacity-60"
        disabled={busy}
      >
        {busy ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
        {phase === "error"
          ? "Tentar novamente"
          : phase === "preparing" || phase === "uploading"
            ? "Preparando seu vídeo..."
            : statusLabel && busy
              ? statusLabel
              : "✨ Gerar clips"}
      </button>
      {phase === "uploading" || phase === "preparing" ? (
        <button type="button" className="w-full text-[12px] text-text-secondary underline-offset-2 hover:underline" onClick={() => void cancelUpload()}>
          Cancelar envio
        </button>
      ) : null}
    </form>
  );
}
