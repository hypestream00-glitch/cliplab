import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import path from "node:path";
import { ffmpegAssPath } from "@/lib/captions/ass";
import { ffmpegTimeoutMs, withFfmpegSlot } from "@/lib/ffmpeg/limits";

export class FFmpegUnavailableError extends Error {
  constructor(message = "FFmpeg/ffprobe não está instalado ou não está no PATH. Instale o FFmpeg e reinicie o servidor.") {
    super(message);
    this.name = "FFmpegUnavailableError";
  }
}

export class ProbeFailedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProbeFailedError";
  }
}

export class FFmpegFailedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FFmpegFailedError";
  }
}

export type ProbeResult = {
  durationMs: number;
  width: number;
  height: number;
  fps: number | null;
  codec: string | null;
  audioCodec: string | null;
  bitrate: number | null;
};

type SpawnResult = { stdout: string; stderr: string; code: number | null };

const WIN_FFMPEG = ["C:\\ffmpeg\\bin\\ffmpeg.exe", "C:\\Program Files\\ffmpeg\\bin\\ffmpeg.exe"];
const WIN_FFPROBE = ["C:\\ffmpeg\\bin\\ffprobe.exe", "C:\\Program Files\\ffmpeg\\bin\\ffprobe.exe"];

let ffmpegBin: string | null | undefined;
let ffprobeBin: string | null | undefined;

async function fileExists(file: string) {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

async function resolveBin(name: string, extras: string[]) {
  for (const candidate of [name, ...extras]) {
    if (path.isAbsolute(candidate)) {
      if (await fileExists(candidate)) return candidate;
      continue;
    }
    const result = await spawnOnce(candidate, ["-version"], 8_000).catch(() => null);
    if (result && result.code === 0) return candidate;
  }
  return null;
}

function parseFfmpegTime(stderrChunk: string) {
  const match = /time=(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(stderrChunk);
  if (!match) return null;
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
}

const MAX_PIPE_CHARS = 256 * 1024;

function appendCapped(current: string, chunk: string) {
  if (current.length >= MAX_PIPE_CHARS) return current;
  return current + chunk.slice(0, MAX_PIPE_CHARS - current.length);
}

function spawnOnce(
  cmd: string,
  args: string[],
  timeoutMs = 120_000,
  onProgress?: (seconds: number) => void,
): Promise<SpawnResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { windowsHide: true, shell: false });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new FFmpegFailedError(`Tempo esgotado: ${cmd}`));
    }, timeoutMs);
    child.stdout.on("data", (chunk) => {
      stdout = appendCapped(stdout, String(chunk));
    });
    child.stderr.on("data", (chunk) => {
      const text = String(chunk);
      stderr = appendCapped(stderr, text);
      if (onProgress) {
        const seconds = parseFfmpegTime(text);
        if (seconds != null) onProgress(seconds);
      }
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, code });
    });
  });
}

export async function getFfmpegPath() {
  if (ffmpegBin !== undefined) return ffmpegBin;
  ffmpegBin = await resolveBin("ffmpeg", process.platform === "win32" ? WIN_FFMPEG : []);
  return ffmpegBin;
}

export async function getFfprobePath() {
  if (ffprobeBin !== undefined) return ffprobeBin;
  ffprobeBin = await resolveBin("ffprobe", process.platform === "win32" ? WIN_FFPROBE : []);
  return ffprobeBin;
}

export async function isFfmpegAvailable() {
  const [ffmpeg, ffprobe] = await Promise.all([getFfmpegPath(), getFfprobePath()]);
  return Boolean(ffmpeg && ffprobe);
}

export async function runFfmpeg(
  args: string[],
  timeoutMs = 10 * 60_000,
  onProgress?: (seconds: number) => void,
) {
  const bin = await getFfmpegPath();
  if (!bin) throw new FFmpegUnavailableError();
  return withFfmpegSlot(async () => {
    const result = await spawnOnce(bin, args, ffmpegTimeoutMs(timeoutMs), onProgress);
    if (result.code !== 0) {
      throw new FFmpegFailedError(result.stderr.slice(-2000) || `ffmpeg saiu com código ${result.code}`);
    }
    return result;
  });
}

function parseFps(rate: string | undefined) {
  if (!rate || rate === "0/0") return null;
  const [a, b] = rate.split("/").map(Number);
  if (!a || !b) {
    const n = Number(rate);
    return Number.isFinite(n) ? n : null;
  }
  return a / b;
}

type FfprobeJson = {
  format?: { duration?: string; bit_rate?: string };
  streams?: Array<{
    codec_type?: string;
    codec_name?: string;
    width?: number;
    height?: number;
    r_frame_rate?: string;
    avg_frame_rate?: string;
    bit_rate?: string;
    duration?: string;
  }>;
};

export function parseFfprobeOutput(stdout: string): ProbeResult {
  let parsed: FfprobeJson;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    throw new ProbeFailedError("ffprobe retornou JSON inválido.");
  }
  const video = parsed.streams?.find((stream) => stream.codec_type === "video");
  const audio = parsed.streams?.find((stream) => stream.codec_type === "audio");
  const durationSec = Number(parsed.format?.duration ?? video?.duration ?? 0);
  if (!Number.isFinite(durationSec) || durationSec <= 0) {
    throw new ProbeFailedError("Não foi possível obter a duração real do vídeo. O arquivo pode estar corrompido.");
  }
  if (!video?.width || !video.height) {
    throw new ProbeFailedError("O arquivo não contém uma faixa de vídeo válida.");
  }
  return {
    durationMs: Math.round(durationSec * 1000),
    width: video.width,
    height: video.height,
    fps: parseFps(video.avg_frame_rate || video.r_frame_rate),
    codec: video.codec_name ?? null,
    audioCodec: audio?.codec_name ?? null,
    bitrate: parsed.format?.bit_rate ? Number(parsed.format.bit_rate) : audio?.bit_rate ? Number(audio.bit_rate) : null,
  };
}

export async function probeVideo(filePath: string): Promise<ProbeResult> {
  const bin = await getFfprobePath();
  if (!bin) throw new FFmpegUnavailableError();
  return withFfmpegSlot(async () => {
    const result = await spawnOnce(
      bin,
      ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", filePath],
      ffmpegTimeoutMs(60_000),
    );
    if (result.code !== 0) {
      throw new ProbeFailedError(result.stderr || "ffprobe falhou ao ler o arquivo.");
    }
    return parseFfprobeOutput(result.stdout);
  });
}

export async function extractThumbnail(inputPath: string, outputPath: string, atMs = 1000) {
  const durationSec = Math.max(0, atMs / 1000);
  await runFfmpeg([
    "-y",
    "-ss",
    durationSec.toFixed(3),
    "-i",
    inputPath,
    "-frames:v",
    "1",
    "-q:v",
    "3",
    outputPath,
  ]);
}

export function extractAudioArgs(inputPath: string, outputPath: string) {
  return ["-y", "-i", inputPath, "-vn", "-ac", "1", "-ar", "16000", "-c:a", "libmp3lame", "-b:a", "64k", outputPath];
}

export async function extractAudio(inputPath: string, outputPath: string) {
  await runFfmpeg(extractAudioArgs(inputPath, outputPath));
}

export function extractAudioRangeArgs(params: {
  inputPath: string;
  outputPath: string;
  startMs: number;
  durationMs: number;
}) {
  return [
    "-y",
    "-ss",
    (Math.max(0, params.startMs) / 1000).toFixed(3),
    "-t",
    (Math.max(50, params.durationMs) / 1000).toFixed(3),
    "-i",
    params.inputPath,
    "-vn",
    "-ac",
    "1",
    "-ar",
    "16000",
    "-c:a",
    "libmp3lame",
    "-b:a",
    "64k",
    params.outputPath,
  ];
}

export async function extractAudioRange(params: {
  inputPath: string;
  outputPath: string;
  startMs: number;
  durationMs: number;
}) {
  await runFfmpeg(extractAudioRangeArgs(params));
}

export function cutClipArgs(params: { inputPath: string; outputPath: string; startMs: number; endMs: number }) {
  const start = Math.max(0, params.startMs) / 1000;
  const duration = Math.max(0.05, (params.endMs - params.startMs) / 1000);
  return [
    "-y",
    "-ss",
    start.toFixed(3),
    "-i",
    params.inputPath,
    "-t",
    duration.toFixed(3),
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "23",
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    "-movflags",
    "+faststart",
    params.outputPath,
  ];
}

export async function cutClip(params: {
  inputPath: string;
  outputPath: string;
  startMs: number;
  endMs: number;
}) {
  await runFfmpeg(cutClipArgs(params));
}

export type RenderSpec = {
  inputPath: string;
  outputPath: string;
  startMs: number;
  durationMs: number;
  width: number;
  height: number;
  crop?: { x: number; y: number; w: number; h: number } | null;
  scale?: number;
  offsetX?: number;
  offsetY?: number;
  texts: Array<{
    text: string;
    x: number;
    y: number;
    fontSize: number;
    fontWeight: number;
    color: string;
    background?: string | null;
    alignment?: "left" | "center" | "right";
    startMs: number;
    endMs: number;
  }>;
  images: Array<{ path: string; x: number; y: number; scale: number; startMs: number; endMs: number }>;
  fontFile: string;
  assPath?: string | null;
  onProgress?: (ratio: number) => void;
};

function escapeDrawtext(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/:/g, "\\:").replace(/'/g, "\\'").replace(/%/g, "\\%");
}

export function defaultFontFile(weight = 400) {
  if (process.platform === "win32") {
    return weight >= 700 ? "C\\:/Windows/Fonts/arialbd.ttf" : "C\\:/Windows/Fonts/arial.ttf";
  }
  return "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf";
}

export async function renderEditedVideo(spec: RenderSpec) {
  const filters: string[] = [];
  if (spec.crop) {
    filters.push(`crop=${Math.round(spec.crop.w)}:${Math.round(spec.crop.h)}:${Math.round(spec.crop.x)}:${Math.round(spec.crop.y)}`);
  }
  const scale = Math.min(2, Math.max(0.25, spec.scale && spec.scale > 0 ? spec.scale : 1));
  const targetW = Math.max(2, Math.round(spec.width * Math.min(1, scale)));
  const targetH = Math.max(2, Math.round(spec.height * Math.min(1, scale)));
  filters.push(`scale=${targetW}:${targetH}:force_original_aspect_ratio=decrease`);
  filters.push(
    `pad=${spec.width}:${spec.height}:${Math.max(0, Math.round(spec.offsetX ?? (spec.width - targetW) / 2))}:${Math.max(0, Math.round(spec.offsetY ?? (spec.height - targetH) / 2))}:black`,
  );
  for (const text of spec.texts) {
    const enable = `between(t\\,${(text.startMs / 1000).toFixed(3)}\\,${(text.endMs / 1000).toFixed(3)})`;
    const box = text.background ? `:box=1:boxcolor=${text.background.replace("#", "0x")}@0.7:boxborderw=8` : "";
    const xExpr =
      text.alignment === "center" ? "(w-text_w)/2" : text.alignment === "right" ? `(w-text_w)-${Math.round(text.x)}` : String(Math.round(text.x));
    filters.push(
      `drawtext=fontfile='${spec.fontFile}':text='${escapeDrawtext(text.text)}':x=${xExpr}:y=${Math.round(text.y)}:fontsize=${Math.round(text.fontSize)}:fontcolor=${text.color.replace("#", "0x")}${box}:enable='${enable}'`,
    );
  }
  const args = ["-y", "-ss", (spec.startMs / 1000).toFixed(3), "-i", spec.inputPath, "-t", (spec.durationMs / 1000).toFixed(3)];
  spec.images.forEach((image) => {
    args.push("-i", image.path);
  });
  let filter = `[0:v]${filters.join(",")}[v0]`;
  let last = "v0";
  spec.images.forEach((image, index) => {
    const enable = `between(t,${(image.startMs / 1000).toFixed(3)},${(image.endMs / 1000).toFixed(3)})`;
    const w = Math.max(32, Math.round(160 * image.scale));
    filter += `;[${index + 1}:v]scale=${w}:-1[ov${index}];[${last}][ov${index}]overlay=${Math.round(image.x)}:${Math.round(image.y)}:enable='${enable}'[v${index + 1}]`;
    last = `v${index + 1}`;
  });
  if (spec.assPath) {
    filter += `;[${last}]ass='${ffmpegAssPath(spec.assPath)}'[vsub]`;
    last = "vsub";
  }
  args.push(
    "-filter_complex",
    filter,
    "-map",
    `[${last}]`,
    "-map",
    "0:a?",
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "20",
    "-r",
    "30",
    "-c:a",
    "aac",
    "-b:a",
    "160k",
    "-movflags",
    "+faststart",
    spec.outputPath,
  );
  const expected = Math.max(0.1, spec.durationMs / 1000);
  await runFfmpeg(args, 20 * 60_000, spec.onProgress ? (seconds) => spec.onProgress?.(Math.min(1, seconds / expected)) : undefined);
}
