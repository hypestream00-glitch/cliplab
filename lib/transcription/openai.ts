import { createReadStream } from "node:fs";
import { stat, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { extractAudioRange } from "@/lib/ffmpeg";
import { fetchWithBackoff } from "@/lib/http/retry";
import { TRANSCRIPT_CHUNK_MS, TRANSCRIPT_CHUNK_OVERLAP_MS, WHISPER_MAX_BYTES } from "@/lib/config/clip-score";
import { normalizeTranscript, type TranscriptSegmentInput, type TranscriptWord } from "@/lib/transcription/normalize";
import { mockTranscriptionProvider } from "@/lib/transcription/mock";
import type { TranscriptionProvider, TranscriptionResult, TranscriptionUsage } from "@/lib/transcription/types";
import { logger } from "@/lib/logger";
import { openaiApiKey, resolveAiMode, AiConfigurationError, EXTERNAL_AI_BLOCKED_MESSAGE } from "@/lib/ai/policy";
import { whisperLanguageParam } from "@/lib/transcription/language";
import { externalAiProcessingAllowed } from "@/lib/env/status";

export class TranscriptionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TranscriptionError";
  }
}

/** Official docs: only whisper-1 supports timestamp_granularities with verbose_json. */
export const TRANSCRIPTION_MODEL = "whisper-1";

function labeledMock(): TranscriptionProvider {
  return {
    ...mockTranscriptionProvider,
    async transcribe(params) {
      const result = await mockTranscriptionProvider.transcribe(params);
      return {
        ...result,
        provider: "MOCK",
        model: "mock",
        fullText: result.fullText.startsWith("[MOCK")
          ? result.fullText
          : `[MOCK — OPENAI_API_KEY ausente. Texto sintético, não extraído do áudio.] ${result.fullText}`,
      };
    },
  };
}

type WhisperPayload = {
  text?: string;
  language?: string;
  duration?: number;
  usage?: { seconds?: number; type?: string };
  segments?: Array<{
    start?: number;
    end?: number;
    text?: string;
    avg_logprob?: number;
    words?: Array<{ start?: number; end?: number; word?: string; probability?: number }>;
  }>;
  words?: Array<{ start?: number; end?: number; word?: string; probability?: number }>;
};

export function parseWhisper(payload: WhisperPayload, offsetMs: number): { fullText: string; segments: TranscriptSegmentInput[] } {
  const segments = (payload.segments ?? []).map((segment) => {
    const words: TranscriptWord[] = (segment.words ?? []).map((word) => ({
      startMs: Math.round(((word.start ?? 0) * 1000) + offsetMs),
      endMs: Math.round(((word.end ?? 0) * 1000) + offsetMs),
      text: (word.word ?? "").trim(),
      confidence: word.probability,
    })).filter((word) => word.text && word.endMs > word.startMs);
    return {
      startMs: Math.round(((segment.start ?? 0) * 1000) + offsetMs),
      endMs: Math.round(((segment.end ?? 0) * 1000) + offsetMs),
      text: (segment.text ?? "").trim(),
      confidence: typeof segment.avg_logprob === "number" ? Math.min(1, Math.max(0, 1 + segment.avg_logprob)) : undefined,
      words,
    };
  }).filter((segment) => segment.text && segment.endMs > segment.startMs);

  if (!segments.length && payload.words?.length) {
    const words: TranscriptWord[] = payload.words.map((word) => ({
      startMs: Math.round(((word.start ?? 0) * 1000) + offsetMs),
      endMs: Math.round(((word.end ?? 0) * 1000) + offsetMs),
      text: (word.word ?? "").trim(),
      confidence: word.probability,
    })).filter((word) => word.text && word.endMs > word.startMs);
    if (words.length) {
      segments.push({
        startMs: words[0].startMs,
        endMs: words[words.length - 1].endMs,
        text: (payload.text ?? words.map((word) => word.text).join(" ")).trim(),
        confidence: undefined,
        words,
      });
    }
  }

  return {
    fullText: payload.text?.trim() || segments.map((segment) => segment.text).join(" "),
    segments,
  };
}

async function transcribeFile(filePath: string, language: string, offsetMs: number, key: string) {
  const form = new FormData();
  form.set("model", TRANSCRIPTION_MODEL);
  form.set("response_format", "verbose_json");
  form.set("timestamp_granularities[]", "segment");
  form.set("timestamp_granularities[]", "word");
  const whisperLang = whisperLanguageParam(language);
  if (whisperLang) form.set("language", whisperLang);
  const blob = await fileToBlob(filePath);
  form.set("file", blob, path.basename(filePath));
  const response = await fetchWithBackoff(
    "https://api.openai.com/v1/audio/transcriptions",
    { method: "POST", headers: { Authorization: `Bearer ${key}` }, body: form },
    { attempts: 3, timeoutMs: 180_000, label: "transcription" },
  );
  const json = (await response.json()) as WhisperPayload;
  const parsed = parseWhisper(json, offsetMs);
  if (!parsed.fullText) throw new TranscriptionError("Transcrição vazia.");
  const usage: TranscriptionUsage | undefined =
    typeof json.usage?.seconds === "number"
      ? { seconds: json.usage.seconds }
      : typeof json.duration === "number"
        ? { seconds: json.duration }
        : undefined;
  return { ...parsed, language: json.language, usage };
}

async function fileToBlob(filePath: string) {
  const info = await stat(filePath);
  if (info.size <= 0) throw new TranscriptionError("Arquivo de áudio inválido ou vazio.");
  if (info.size > WHISPER_MAX_BYTES) throw new TranscriptionError("Chunk de áudio excede o limite da API.");
  const chunks: Buffer[] = [];
  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    stream.on("error", reject);
    stream.on("end", resolve);
  });
  const buffer = Buffer.concat(chunks);
  return new Blob([new Uint8Array(buffer)], { type: "audio/mpeg" });
}

export function chunkWindows(durationMs: number, fileSize: number) {
  const sizeLimitedMs =
    fileSize > WHISPER_MAX_BYTES
      ? Math.max(30_000, Math.floor(durationMs * (WHISPER_MAX_BYTES / fileSize) * 0.85))
      : TRANSCRIPT_CHUNK_MS;
  const chunkMs = Math.min(TRANSCRIPT_CHUNK_MS, sizeLimitedMs);
  const needsSplit = fileSize > WHISPER_MAX_BYTES || durationMs > chunkMs;
  if (!needsSplit) return [{ startMs: 0, endMs: durationMs }];
  const windows: Array<{ startMs: number; endMs: number }> = [];
  let start = 0;
  while (start < durationMs) {
    const end = Math.min(durationMs, start + chunkMs);
    windows.push({ startMs: start, endMs: end });
    if (end >= durationMs) break;
    start = Math.max(start + 1, end - TRANSCRIPT_CHUNK_OVERLAP_MS);
  }
  return windows;
}

export function getTranscriptionProvider(): TranscriptionProvider {
  if (resolveAiMode() === "mock") {
    return {
      ...labeledMock(),
      async transcribe(params) {
        if (!externalAiProcessingAllowed()) {
          throw new AiConfigurationError(EXTERNAL_AI_BLOCKED_MESSAGE);
        }
        return labeledMock().transcribe(params);
      },
    };
  }
  const key = openaiApiKey();
  return {
    id: "openai-whisper",
    mocked: false,
    providerLabel: "OPENAI",
    async transcribe({ language, audioPath, durationMs }): Promise<TranscriptionResult> {
      if (!audioPath) throw new TranscriptionError("Áudio para transcrição não encontrado.");
      const info = await stat(audioPath).catch(() => null);
      if (!info || info.size <= 0) throw new TranscriptionError("Arquivo de áudio inválido.");
      const windows = chunkWindows(durationMs, info.size);
      const all: TranscriptSegmentInput[] = [];
      const temps: string[] = [];
      let detectedLanguage = language;
      let usageSeconds = 0;
      try {
        for (const window of windows) {
          let file = audioPath;
          let offset = 0;
          if (windows.length > 1) {
            const chunkPath = path.join(tmpdir(), `cliplab-audio-${Date.now()}-${window.startMs}.mp3`);
            temps.push(chunkPath);
            await extractAudioRange({
              inputPath: audioPath,
              outputPath: chunkPath,
              startMs: window.startMs,
              durationMs: window.endMs - window.startMs,
            });
            file = chunkPath;
            offset = window.startMs;
          }
          const part = await transcribeFile(file, language, offset, key);
          all.push(...part.segments);
          if (part.language) detectedLanguage = part.language;
          if (part.usage?.seconds) usageSeconds += part.usage.seconds;
        }
      } finally {
        await Promise.all(temps.map((file) => unlink(file).catch(() => undefined)));
      }
      const segments = normalizeTranscript(all, durationMs);
      if (!segments.length) throw new TranscriptionError("Nenhum segmento válido após normalizar a transcrição.");
      logger.info({ chunks: windows.length, segments: segments.length, usageSeconds, model: TRANSCRIPTION_MODEL }, "transcription complete");
      return {
        provider: "OPENAI",
        model: TRANSCRIPTION_MODEL,
        language: detectedLanguage,
        usage: usageSeconds ? { seconds: usageSeconds } : undefined,
        fullText: segments.map((segment) => segment.text).join(" "),
        segments,
      };
    },
  };
}
