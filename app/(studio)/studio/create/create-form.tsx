"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatBytes, formatDuration } from "@/lib/utils/format";
import { friendlyError } from "@/lib/ui/friendly-error";
import { cn } from "@/lib/utils";

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
    <form onSubmit={onSubmit} className="mx-auto max-w-3xl space-y-6">
      <label
        className={cn(
          "flex min-h-[280px] cursor-pointer flex-col items-center justify-center rounded-3xl border border-dashed bg-card px-6 text-center transition-colors",
          dragOver && "border-primary bg-primary/5",
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
        {fileMeta ? (
          <div className="flex w-full max-w-md items-center gap-4 text-left">
            {fileMeta.preview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={fileMeta.preview} alt="" className="h-28 w-16 rounded-lg object-cover" />
            ) : (
              <div className="h-28 w-16 rounded-lg bg-muted" />
            )}
            <div className="min-w-0">
              <p className="truncate text-[14px] font-medium">{fileMeta.name}</p>
              <p className="mt-1 text-[13px] text-muted-foreground">
                {formatBytes(fileMeta.size)}
                {fileMeta.durationMs ? ` · ${formatDuration(fileMeta.durationMs)}` : ""}
                {fileMeta.width && fileMeta.height ? ` · ${fileMeta.width}×${fileMeta.height}` : ""}
              </p>
              {statusLabel ? <p className="mt-2 text-[12px] text-primary">{statusLabel}</p> : <p className="mt-2 text-[12px] text-muted-foreground">Clique para trocar o arquivo</p>}
              {phase === "uploading" ? (
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                  <div className="h-full bg-primary transition-[width]" style={{ width: `${progress}%` }} />
                </div>
              ) : null}
            </div>
          </div>
        ) : (
          <>
            <p className="text-[16px] font-medium">Arraste seu vídeo aqui</p>
            <p className="mt-1 text-[13px] text-muted-foreground">ou</p>
            <span className="mt-3 inline-flex h-9 items-center rounded-lg bg-primary px-3 text-[13px] font-medium text-primary-foreground">
              Selecionar vídeo
            </span>
            <p className="mt-3 text-[12px] text-muted-foreground">MP4, MOV ou WEBM — envio direto ao storage</p>
          </>
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

      <div className="rounded-2xl border bg-card p-4">
        <label className="flex cursor-pointer items-start gap-3">
          <input type="radio" name="experience" className="mt-1 accent-primary" defaultChecked onChange={() => setAdvanced(false)} />
          <span>
            <span className="block text-[14px] font-medium">Modo automático</span>
            <span className="mt-0.5 block text-[13px] text-muted-foreground">
              Recomendado — a IA escolhe automaticamente os melhores momentos e configura os clips.
            </span>
          </span>
        </label>
        <label className="mt-3 flex cursor-pointer items-start gap-3">
          <input type="radio" name="experience" className="mt-1 accent-primary" onChange={() => setAdvanced(true)} />
          <span className="text-[14px] font-medium">Personalizar</span>
        </label>

        {!advanced ? (
          <>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="clipCountSimple">Quantidade de clips (máx. {maxClipsPerProject})</Label>
                <Input id="clipCountSimple" name="clipCount" type="number" defaultValue={Math.min(8, maxClipsPerProject)} min={1} max={maxClipsPerProject} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="languageSimple">Idioma</Label>
                <select id="languageSimple" name="language" className="h-8 w-full rounded-md border bg-transparent px-2 text-[13px]" defaultValue="auto">
                  <option value="auto">Detectar automaticamente</option>
                  <option value="pt-BR">Português (Brasil)</option>
                  <option value="en">English</option>
                  <option value="es">Español</option>
                </select>
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Duração aproximada</Label>
                <div className="grid grid-cols-3 gap-2 text-[13px]">
                  {[
                    ["15-30", "Curto", "15–30s"],
                    ["30-60", "Médio", "30–60s"],
                    ["60-90", "Longo", "60–90s"],
                  ].map(([value, label, hint]) => (
                    <label key={value} className="flex flex-col rounded-lg border px-2 py-1.5">
                      <span className="flex items-center gap-2">
                        <input type="radio" name="clipDuration" value={value} defaultChecked={value === "15-30"} />
                        {label}
                      </span>
                      <span className="pl-5 text-[11px] text-muted-foreground">{hint}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Formato</Label>
                <div className="grid grid-cols-3 gap-2 text-[13px]">
                  {[
                    ["9:16", "Vertical"],
                    ["1:1", "Quadrado"],
                    ["16:9", "Horizontal"],
                  ].map(([value, label]) => (
                    <label key={value} className="flex items-center gap-2 rounded-lg border px-2 py-1.5">
                      <input type="radio" name="outputAspect" value={value} defaultChecked={value === "9:16"} />
                      {label} {value}
                    </label>
                  ))}
                </div>
              </div>
              <label className="flex items-center gap-2 text-[13px] sm:col-span-2">
                <input type="checkbox" name="autoCaptions" defaultChecked className="size-3.5 accent-primary" />
                Legendas automáticas
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
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="name">Nome do projeto</Label>
              <Input id="name" name="name" placeholder="Opcional — usamos o nome do arquivo" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="language">Idioma</Label>
              <select id="language" name="language" className="h-8 w-full rounded-md border bg-transparent px-2 text-[13px]" defaultValue="auto">
                <option value="auto">Detectar automaticamente</option>
                <option value="pt-BR">Português (Brasil)</option>
                <option value="en">English</option>
                <option value="es">Español</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="clipCount">Quantidade de clips (máx. {maxClipsPerProject})</Label>
              <Input id="clipCount" name="clipCount" type="number" defaultValue={maxClipsPerProject} min={1} max={maxClipsPerProject} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Duração desejada</Label>
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
              <Label>Formato</Label>
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
              <Label htmlFor="mode">Estilo</Label>
              <select id="mode" name="mode" className="h-8 w-full rounded-md border bg-transparent px-2 text-[13px]" defaultValue="AUTOMATIC">
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
                  <input type="checkbox" name={name} defaultChecked className="size-3.5 accent-primary" />
                  {label}
                </label>
              ))}
            </div>
          </div>
        )}
      </div>

      <label className="flex items-start gap-2 text-[13px]">
        <input type="checkbox" name="authorized" required className="mt-0.5 size-3.5 accent-primary" />
        Confirmo que tenho autorização para utilizar este conteúdo.
      </label>
      {error ? (
        <p className="text-[13px] text-destructive">
          {error} {phase === "error" ? "Você pode tentar novamente com o mesmo arquivo." : ""}
        </p>
      ) : null}
      <Button type="submit" className="h-10 w-full text-[14px]" disabled={busy}>
        {phase === "error" ? "Tentar novamente" : statusLabel && busy ? statusLabel : "Gerar clips"}
      </Button>
      {phase === "uploading" || phase === "preparing" ? (
        <button type="button" className="w-full text-[12px] text-muted-foreground underline-offset-2 hover:underline" onClick={() => void cancelUpload()}>
          Cancelar envio
        </button>
      ) : null}
    </form>
  );
}
