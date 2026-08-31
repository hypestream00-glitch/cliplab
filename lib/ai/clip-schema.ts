import { z } from "zod";

const scoreField = z.number().finite();

export const clipCandidateSchema = z
  .object({
    startMs: z.number().finite().optional(),
    endMs: z.number().finite().optional(),
    startTime: z.number().finite().optional(),
    endTime: z.number().finite().optional(),
    title: z.string().min(1).max(120),
    summary: z.string().max(500).optional().default(""),
    reason: z.string().min(1).max(500),
    hookScore: scoreField,
    retentionScore: scoreField,
    clarityScore: scoreField,
    emotionScore: scoreField,
    shareScore: scoreField.optional(),
    shareabilityScore: scoreField.optional(),
    score: scoreField.optional(),
    caption: z.string().max(2200).optional(),
    suggestedCaption: z.string().max(2200).optional(),
    hashtags: z.array(z.string().max(40)).max(12).optional(),
    suggestedHashtags: z.array(z.string().max(40)).max(12).optional(),
  })
  .transform((value) => {
    const startMs = value.startMs ?? (typeof value.startTime === "number" ? Math.round(value.startTime * 1000) : undefined);
    const endMs = value.endMs ?? (typeof value.endTime === "number" ? Math.round(value.endTime * 1000) : undefined);
    if (startMs == null || endMs == null) {
      throw new Error("Structured output sem start/end.");
    }
    const shareabilityScore = value.shareabilityScore ?? value.shareScore ?? 0;
    return {
      startMs,
      endMs,
      title: value.title.trim(),
      summary: (value.summary || value.reason).trim(),
      reason: value.reason.trim(),
      hookScore: value.hookScore,
      retentionScore: value.retentionScore,
      clarityScore: value.clarityScore,
      emotionScore: value.emotionScore,
      shareabilityScore,
      shareScore: shareabilityScore,
      suggestedCaption: (value.suggestedCaption ?? value.caption ?? "").trim(),
      suggestedHashtags: value.suggestedHashtags ?? value.hashtags ?? [],
    };
  });

export const clipAnalysisSchema = z.object({
  clips: z.array(z.unknown()).min(1).max(40),
});

export type StructuredClipCandidate = {
  startMs: number;
  endMs: number;
  title: string;
  summary: string;
  reason: string;
  hookScore: number;
  retentionScore: number;
  clarityScore: number;
  emotionScore: number;
  shareabilityScore: number;
  shareScore: number;
  suggestedCaption: string;
  suggestedHashtags: string[];
};

/** Official Chat Completions structured output schema (strict JSON Schema). */
export const CLIP_ANALYSIS_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["clips"],
  properties: {
    clips: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "startMs",
          "endMs",
          "title",
          "summary",
          "caption",
          "hashtags",
          "reason",
          "hookScore",
          "retentionScore",
          "clarityScore",
          "emotionScore",
          "shareScore",
        ],
        properties: {
          startMs: { type: "number" },
          endMs: { type: "number" },
          title: { type: "string" },
          summary: { type: "string" },
          caption: { type: "string" },
          hashtags: { type: "array", items: { type: "string" } },
          reason: { type: "string" },
          hookScore: { type: "number" },
          retentionScore: { type: "number" },
          clarityScore: { type: "number" },
          emotionScore: { type: "number" },
          shareScore: { type: "number" },
        },
      },
    },
  },
} as const;

export function parseClipAnalysisJson(raw: string) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Structured output de IA não é JSON válido.");
  }
  const envelope = clipAnalysisSchema.safeParse(parsed);
  if (!envelope.success) {
    throw new Error(`Structured output de IA inválido: ${envelope.error.issues[0]?.message ?? "schema"}`);
  }
  const clips: StructuredClipCandidate[] = [];
  for (const item of envelope.data.clips) {
    const result = clipCandidateSchema.safeParse(item);
    if (!result.success) {
      throw new Error(`Structured output de IA inválido: ${result.error.issues[0]?.message ?? "clip"}`);
    }
    clips.push(result.data);
  }
  return clips;
}
