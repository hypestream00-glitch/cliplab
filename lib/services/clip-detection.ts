import type { TranscriptInput } from "@/lib/ai/provider";
import { clampScore } from "@/lib/ai/provider";
import { CLIP_ANALYSIS_JSON_SCHEMA, parseClipAnalysisJson, type StructuredClipCandidate } from "@/lib/ai/clip-schema";
import { openaiApiKey, resolveAiMode, AiConfigurationError, EXTERNAL_AI_BLOCKED_MESSAGE } from "@/lib/ai/policy";
import { externalAiProcessingAllowed } from "@/lib/env/status";
import { removeOverlappingCandidates } from "@/lib/ai/overlap";
import { clampClipDurationRange, compositeViralScore } from "@/lib/config/clip-score";
import { fetchWithBackoff } from "@/lib/http/retry";
import { validateClipWindow } from "@/lib/media/validate";
import { snapWindowToSpeech, type TranscriptSegmentInput } from "@/lib/transcription/normalize";
import { logger } from "@/lib/logger";

export class ClipDetectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ClipDetectionError";
  }
}

export type AnalyzedClip = StructuredClipCandidate & {
  score: number;
  mocked: boolean;
};

export type AnalysisUsage = {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
};

export interface ClipAnalysisProvider {
  id: string;
  mocked: boolean;
  providerLabel: "OPENAI" | "MOCK";
  analyze(input: TranscriptInput): Promise<{ clips: StructuredClipCandidate[]; usage?: AnalysisUsage; model: string }>;
}

const SYSTEM_PROMPT = `You select short standalone video clips from a timestamped transcript of the REAL video.
Return only the structured schema. Times are milliseconds on the ORIGINAL video.
Analyze HOOK, RETENTION, CLARITY, EMOTION, SHAREABILITY from the spoken content.
Prefer: jokes, strong opinions, stories, reveals, reactions, highlights, gameplay, kills, debates, insights, Q&A, surprises, punchlines, emotional turns.
Avoid: long greetings, silence, incomplete context, mid-sentence cuts, missing payoff, repetition, near-duplicate windows.
Title, caption, hashtags and reason MUST be derived from the transcript. Do not invent events that are not in the text.
Scores 0-100. Do not invent timestamps outside DurationMs.`;

export function analysisModel() {
  return process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";
}

function compactTranscript(segments: TranscriptInput["segments"], maxChars = 36_000) {
  const lines = segments.map((segment) => `[${segment.startMs}-${segment.endMs}] ${segment.text}`);
  const joined = lines.join("\n");
  if (joined.length <= maxChars) return joined;
  const step = Math.max(1, Math.ceil(lines.length / Math.max(8, Math.floor(maxChars / 80))));
  return lines.filter((_, index) => index % step === 0 || index === 0 || index === lines.length - 1).join("\n").slice(0, maxChars);
}

export const mockClipAnalysisProvider: ClipAnalysisProvider = {
  id: "mock-clip-analysis",
  mocked: true,
  providerLabel: "MOCK",
  async analyze(input) {
    const count = Math.min(12, Math.max(1, Number(input.metadata.clipCount) || 6), Math.max(1, Math.floor(input.durationMs / 500)));
    const range = clampClipDurationRange(
      Number(input.metadata.clipDurationMin) || 15,
      Number(input.metadata.clipDurationMax) || 30,
      input.durationMs / 1000,
    );
    const minMs = range.minSec * 1000;
    const maxMs = range.maxSec * 1000;
    const length = Math.max(500, Math.min(maxMs, Math.max(minMs, Math.round(input.durationMs / (count + 1)))));
    const clips: StructuredClipCandidate[] = [];
    for (let i = 0; i < count; i++) {
      const start = Math.min(input.durationMs - length, Math.floor((input.durationMs - length) * (i / Math.max(1, count - 1))));
      const end = Math.min(input.durationMs, start + length);
      clips.push({
        startMs: Math.max(0, start),
        endMs: end,
        title: `[MOCK] Clipe ${i + 1}`,
        summary: "Intervalo gerado automaticamente. Não veio de análise do conteúdo.",
        reason: "OPENAI_API_KEY ausente — detecção MOCK sobre o vídeo real.",
        hookScore: 50,
        retentionScore: 50,
        clarityScore: 50,
        emotionScore: 50,
        shareabilityScore: 50,
        shareScore: 50,
        suggestedCaption: "[MOCK] Caption não gerada por IA.",
        suggestedHashtags: ["mock"],
      });
    }
    return { clips, model: "mock" };
  },
};

async function openaiAnalyzeOnce(input: TranscriptInput, key: string) {
  const count = Number(input.metadata.clipCount) || 8;
  const minS = Number(input.metadata.clipDurationMin) || 15;
  const maxS = Number(input.metadata.clipDurationMax) || 30;
  const mode = String(input.metadata.mode ?? "AUTOMATIC");
  const excerpt = compactTranscript(input.segments);
  const model = analysisModel();
  const response = await fetchWithBackoff(
    "https://api.openai.com/v1/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "clip_analysis",
            strict: true,
            schema: CLIP_ANALYSIS_JSON_SCHEMA,
          },
        },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: `DurationMs=${input.durationMs}. Language=${input.language}. Mode=${mode}. Want ${count} clips of ${minS}-${maxS}s each.\nTranscript:\n${excerpt}`,
          },
        ],
      }),
    },
    { attempts: 3, timeoutMs: 90_000, label: "clip-analysis" },
  );
  const json = (await response.json()) as {
    choices?: Array<{ message?: { content?: string; refusal?: string } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
  };
  const refusal = json.choices?.[0]?.message?.refusal;
  if (refusal) throw new ClipDetectionError("A análise foi recusada pelo provedor.");
  const content = json.choices?.[0]?.message?.content;
  if (!content) throw new ClipDetectionError("Resposta de IA vazia.");
  const clips = parseClipAnalysisJson(content);
  logger.info(
    {
      model,
      promptTokens: json.usage?.prompt_tokens,
      completionTokens: json.usage?.completion_tokens,
      totalTokens: json.usage?.total_tokens,
      clipCount: clips.length,
    },
    "clip analysis complete",
  );
  return {
    clips,
    model,
    usage: {
      promptTokens: json.usage?.prompt_tokens,
      completionTokens: json.usage?.completion_tokens,
      totalTokens: json.usage?.total_tokens,
    } satisfies AnalysisUsage,
  };
}

export const openaiClipAnalysisProvider: ClipAnalysisProvider = {
  id: "openai-clip-analysis",
  mocked: false,
  providerLabel: "OPENAI",
  async analyze(input) {
    const key = openaiApiKey();
    if (!key) throw new ClipDetectionError("OPENAI_API_KEY ausente");
    let lastError: Error | null = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        return await openaiAnalyzeOnce(input, key);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error("Falha na análise");
        const invalid = lastError.message.includes("Structured output") || lastError.message.includes("JSON");
        if (!invalid) throw lastError;
        logger.warn({ attempt }, "clip analysis structured output retry");
      }
    }
    throw lastError ?? new ClipDetectionError("Structured output inválido após retry.");
  },
};

export function getClipAnalysisProvider(): ClipAnalysisProvider {
  if (!externalAiProcessingAllowed()) {
    return {
      id: "openai-clip-analysis-blocked",
      mocked: true,
      providerLabel: "MOCK",
      async analyze() {
        throw new AiConfigurationError(EXTERNAL_AI_BLOCKED_MESSAGE);
      },
    };
  }
  return resolveAiMode() === "real" ? openaiClipAnalysisProvider : mockClipAnalysisProvider;
}

export function getClipDetectionProvider() {
  return getClipAnalysisProvider();
}

function sanitizeCandidates(
  raw: StructuredClipCandidate[],
  durationMs: number,
  minMs: number,
  maxMs: number,
  segments: TranscriptSegmentInput[],
  mocked: boolean,
): AnalyzedClip[] {
  const valid: AnalyzedClip[] = [];
  for (const item of raw) {
    try {
      if (!Number.isFinite(item.startMs) || !Number.isFinite(item.endMs)) continue;
      if (item.startMs < 0 || item.endMs > durationMs || item.endMs <= item.startMs) {
        throw new Error("timestamp fora do vídeo");
      }
      const snapped = snapWindowToSpeech(item.startMs, item.endMs, segments, durationMs, minMs, maxMs);
      const window = validateClipWindow(snapped.startMs, snapped.endMs, durationMs);
      const subs = {
        hookScore: clampScore(item.hookScore),
        retentionScore: clampScore(item.retentionScore),
        emotionScore: clampScore(item.emotionScore),
        clarityScore: clampScore(item.clarityScore),
        shareabilityScore: clampScore(item.shareabilityScore),
      };
      valid.push({
        ...item,
        ...subs,
        shareScore: subs.shareabilityScore,
        startMs: window.startMs,
        endMs: window.endMs,
        score: compositeViralScore(subs),
        mocked,
        suggestedHashtags: (item.suggestedHashtags ?? []).map((tag) => tag.replace(/^#/, "").slice(0, 40)).filter(Boolean),
      });
    } catch {
      logger.warn({ start: item.startMs, end: item.endMs }, "clip candidate rejected");
    }
  }
  return valid;
}

export async function detectClips(params: {
  input: TranscriptInput;
  durationMs: number;
  clipCount: number;
  clipDurationMin: number;
  clipDurationMax: number;
  forceMock?: boolean;
}) {
  const range = clampClipDurationRange(params.clipDurationMin, params.clipDurationMax, params.durationMs / 1000);
  const provider = params.forceMock ? mockClipAnalysisProvider : getClipAnalysisProvider();
  const analyzed = await provider.analyze({
    ...params.input,
    metadata: {
      ...params.input.metadata,
      clipCount: params.clipCount,
      clipDurationMin: range.minSec,
      clipDurationMax: range.maxSec,
    },
  });
  const valid = sanitizeCandidates(
    analyzed.clips,
    params.durationMs,
    range.minSec * 1000,
    range.maxSec * 1000,
    params.input.segments,
    provider.mocked,
  );
  const unique = removeOverlappingCandidates(
    valid.map((clip) => ({ ...clip, startMs: clip.startMs, endMs: clip.endMs, score: clip.score })),
  );
  if (unique.length === 0) {
    throw new ClipDetectionError("Nenhum clipe válido após validar timestamps e overlap.");
  }
  return {
    provider,
    model: analyzed.model,
    usage: analyzed.usage,
    clips: unique.slice(0, params.clipCount),
  };
}

export async function regenerateClipSuggestions(params: {
  language: string;
  durationMs: number;
  startMs: number;
  endMs: number;
  segments: TranscriptInput["segments"];
  mode?: string;
}) {
  const provider = getClipAnalysisProvider();
  if (provider.mocked) {
    throw new ClipDetectionError("Regenerar sugestões exige OPENAI_API_KEY.");
  }
  const windowSegments = params.segments.filter((segment) => segment.endMs > params.startMs && segment.startMs < params.endMs);
  const lengthSec = Math.max(1, Math.round((params.endMs - params.startMs) / 1000));
  const analyzed = await provider.analyze({
    language: params.language,
    durationMs: params.durationMs,
    segments: windowSegments.length ? windowSegments : params.segments,
    metadata: {
      clipCount: 1,
      clipDurationMin: lengthSec,
      clipDurationMax: lengthSec,
      mode: params.mode ?? "AUTOMATIC",
    },
  });
  const valid = sanitizeCandidates(
    analyzed.clips,
    params.durationMs,
    Math.max(1000, params.endMs - params.startMs - 2000),
    params.endMs - params.startMs + 2000,
    params.segments,
    false,
  );
  return valid[0] ?? null;
}

export { mockClipAnalysisProvider as mockClipDetectionProvider };
export { mockClipAnalysisProvider as mockAIProvider };
