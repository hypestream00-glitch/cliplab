import { afterEach, describe, expect, it, vi } from "vitest";
import { writeFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { validateClipWindow, InvalidVideoError } from "@/lib/media/validate";
import { parseClipAnalysisJson } from "@/lib/ai/clip-schema";
import { AiConfigurationError, resolveAiMode, sanitizePublicError } from "@/lib/ai/policy";
import { clampClipDurationRange, compositeViralScore, CLIP_DURATION_MAX_SEC, CLIP_DURATION_MIN_SEC } from "@/lib/config/clip-score";
import { cutClipArgs, extractAudioArgs } from "@/lib/ffmpeg";
import { classifyHttpStatus, fetchWithBackoff } from "@/lib/http/retry";
import { analysisInputHash } from "@/lib/media/hash";
import { analysisCreditKey } from "@/lib/webhooks/idempotency";
import { PIPELINE_DISPLAY_STEPS, PIPELINE_STAGES, normalizeExecutionBadge, pipelineDisplayIndex, pipelineStageFromStatus } from "@/lib/pipeline/stages";
import { chunkWindows, getTranscriptionProvider, parseWhisper } from "@/lib/transcription/openai";
import { detectClips, getClipAnalysisProvider } from "@/lib/services/clip-detection";

const originalFetch = globalThis.fetch;
const originalKey = process.env.OPENAI_API_KEY;

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalKey) process.env.OPENAI_API_KEY = originalKey;
  else delete process.env.OPENAI_API_KEY;
  vi.restoreAllMocks();
});

describe("audio extraction args", () => {
  it("extracts mono 16kHz mp3 for transcription", () => {
    const args = extractAudioArgs("in.mp4", "out.mp3");
    expect(args).toContain("-vn");
    expect(args).toContain("16000");
    expect(args).toContain("libmp3lame");
  });
});

describe("physical clip generation args", () => {
  it("cuts the exact start/end window into an mp4", () => {
    const args = cutClipArgs({ inputPath: "in.mp4", outputPath: "clip.mp4", startMs: 1500, endMs: 4500 });
    expect(args).toContain("-ss");
    expect(args).toContain("1.500");
    expect(args).toContain("-t");
    expect(args).toContain("3.000");
    expect(args).toContain("clip.mp4");
  });
});

describe("whisper timestamps", () => {
  it("maps segment and word times with offset", () => {
    const parsed = parseWhisper(
      {
        text: "olá mundo",
        language: "pt",
        segments: [
          {
            start: 1.2,
            end: 3.4,
            text: "olá mundo",
            words: [
              { start: 1.2, end: 2, word: "olá" },
              { start: 2, end: 3.4, word: "mundo" },
            ],
          },
        ],
      },
      10_000,
    );
    expect(parsed.segments[0].startMs).toBe(11200);
    expect(parsed.segments[0].endMs).toBe(13400);
    expect(parsed.segments[0].words?.[0].text).toBe("olá");
  });

  it("splits long audio into overlapping windows", () => {
    const windows = chunkWindows(25 * 60_000, 1024);
    expect(windows.length).toBeGreaterThan(1);
    expect(windows[0].startMs).toBe(0);
    expect(windows[1].startMs).toBeLessThan(windows[0].endMs);
  });
});

describe("transcription HTTP mock", () => {
  it("uses the real provider path without calling OpenAI", async () => {
    process.env.OPENAI_API_KEY = "sk-test-not-used";
    const file = path.join(tmpdir(), `cliplab-transcribe-${Date.now()}.mp3`);
    writeFileSync(file, Buffer.from("fake-audio"));
    globalThis.fetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          text: "gancho real do vídeo",
          language: "pt",
          usage: { type: "duration", seconds: 4 },
          segments: [{ start: 0, end: 2.5, text: "gancho real do vídeo", words: [{ start: 0, end: 2.5, word: "gancho" }] }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    ) as unknown as typeof fetch;
    try {
      const result = await getTranscriptionProvider().transcribe({ durationMs: 2500, language: "pt", audioPath: file });
      expect(result.provider).toBe("OPENAI");
      expect(result.model).toBe("whisper-1");
      expect(result.fullText).toContain("gancho real do vídeo");
      expect(result.segments[0].endMs).toBe(2500);
      expect(result.usage?.seconds).toBe(4);
      expect(JSON.stringify(result)).not.toMatch(/sk-test/);
    } finally {
      unlinkSync(file);
    }
  });
});

describe("structured analysis output", () => {
  it("accepts shareScore/caption aliases and rejects invalid JSON", () => {
    expect(() => parseClipAnalysisJson("{bad")).toThrow();
    const clips = parseClipAnalysisJson(
      JSON.stringify({
        clips: [
          {
            startTime: 1,
            endTime: 8,
            title: "Hook real",
            summary: "Do transcript",
            reason: "Frase de impacto no áudio",
            hookScore: 80,
            retentionScore: 70,
            clarityScore: 60,
            emotionScore: 90,
            shareScore: 75,
            caption: "wow",
            hashtags: ["clip"],
          },
        ],
      }),
    );
    expect(clips[0].startMs).toBe(1000);
    expect(clips[0].endMs).toBe(8000);
    expect(clips[0].shareScore).toBe(75);
    expect(clips[0].suggestedCaption).toBe("wow");
  });

  it("rejects out-of-range timestamps", () => {
    expect(() => validateClipWindow(-1, 10, 100)).toThrow(InvalidVideoError);
    expect(() => validateClipWindow(0, 200, 100)).toThrow(InvalidVideoError);
    expect(() => validateClipWindow(20, 10, 100)).toThrow(InvalidVideoError);
  });
});

describe("score validation", () => {
  it("normalizes composite score to 0-100 from real sub-scores", () => {
    expect(
      compositeViralScore({
        hookScore: 100,
        retentionScore: 0,
        emotionScore: 0,
        clarityScore: 0,
        shareabilityScore: 0,
      }),
    ).toBe(28);
    expect(
      compositeViralScore({
        hookScore: 100,
        retentionScore: 100,
        emotionScore: 100,
        clarityScore: 100,
        shareabilityScore: 100,
      }),
    ).toBe(100);
  });
});

describe("clip duration limits", () => {
  it("clamps suggestions into the product 15-90s window", () => {
    expect(CLIP_DURATION_MIN_SEC).toBe(15);
    expect(CLIP_DURATION_MAX_SEC).toBe(90);
    expect(clampClipDurationRange(5, 180, 600)).toEqual({ minSec: 15, maxSec: 90 });
    expect(clampClipDurationRange(15, 30, 20)).toEqual({ minSec: 15, maxSec: 20 });
  });
});

describe("analysis HTTP mock", () => {
  it("parses structured output and drops invalid windows", async () => {
    process.env.OPENAI_API_KEY = "sk-test-not-used";
    globalThis.fetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
          choices: [
            {
              message: {
                content: JSON.stringify({
                  clips: [
                    {
                      startMs: 1000,
                      endMs: 20_000,
                      title: "Momento do transcript",
                      summary: "fala real",
                      caption: "caption real",
                      hashtags: ["real"],
                      reason: "gancho na fala",
                      hookScore: 88,
                      retentionScore: 70,
                      clarityScore: 65,
                      emotionScore: 60,
                      shareScore: 72,
                    },
                    {
                      startMs: 9_999_999,
                      endMs: 10_000_000,
                      title: "fora",
                      summary: "inválido",
                      caption: "x",
                      hashtags: [],
                      reason: "fora do vídeo",
                      hookScore: 10,
                      retentionScore: 10,
                      clarityScore: 10,
                      emotionScore: 10,
                      shareScore: 10,
                    },
                  ],
                }),
              },
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    ) as unknown as typeof fetch;

    const detected = await detectClips({
      input: {
        language: "pt",
        durationMs: 40_000,
        segments: [{ startMs: 800, endMs: 21_000, text: "gancho na fala real do vídeo" }],
        metadata: {},
      },
      durationMs: 40_000,
      clipCount: 8,
      clipDurationMin: 15,
      clipDurationMax: 30,
    });
    expect(detected.provider.mocked).toBe(false);
    expect(detected.clips.length).toBe(1);
    expect(detected.clips[0].title).toBe("Momento do transcript");
    expect(detected.clips[0].endMs).toBeLessThanOrEqual(40_000);
    expect(detected.clips[0].score).toBeGreaterThan(0);
    expect(detected.clips[0].score).toBeLessThanOrEqual(100);
    expect(detected.usage?.totalTokens).toBe(30);
  });
});

describe("real/mock separation", () => {
  it("never labels mock providers as real", () => {
    delete process.env.OPENAI_API_KEY;
    expect(getTranscriptionProvider().mocked).toBe(true);
    expect(getTranscriptionProvider().providerLabel).toBe("MOCK");
    expect(getClipAnalysisProvider().mocked).toBe(true);
    expect(normalizeExecutionBadge("OPENAI")).toBe("REAL");
    expect(normalizeExecutionBadge("MOCK")).toBe("MOCK");
    expect(normalizeExecutionBadge("pending")).toBe("PENDING");
  });

  it("blocks OpenAI when ALLOW_EXTERNAL_AI_PROCESSING is false even with a key", () => {
    expect(
      resolveAiMode({
        NODE_ENV: "production",
        OPENAI_API_KEY: "sk-test",
        ALLOW_EXTERNAL_AI_PROCESSING: "false",
      } as NodeJS.ProcessEnv),
    ).toBe("mock");
  });

  it("fails closed in production when AI is enabled without a key", () => {
    expect(() =>
      resolveAiMode({
        NODE_ENV: "production",
        ALLOW_EXTERNAL_AI_PROCESSING: "true",
      } as NodeJS.ProcessEnv),
    ).toThrow(AiConfigurationError);
  });

  it("defaults production AI off so missing keys do not throw until explicitly enabled", () => {
    expect(resolveAiMode({ NODE_ENV: "production" } as NodeJS.ProcessEnv)).toBe("mock");
  });
});

describe("retry", () => {
  it("retries 429 then succeeds, and does not retry 401", async () => {
    let calls = 0;
    globalThis.fetch = vi.fn(async () => {
      calls += 1;
      if (calls === 1) return new Response("limit", { status: 429 });
      return new Response("ok", { status: 200 });
    }) as unknown as typeof fetch;
    const ok = await fetchWithBackoff("https://example.invalid/retry", { method: "GET" }, { attempts: 3, timeoutMs: 5_000, jitter: false, sleep: async () => undefined });
    expect(ok.status).toBe(200);
    expect(calls).toBe(2);
    expect(classifyHttpStatus(401).retryable).toBe(false);
    expect(classifyHttpStatus(400).retryable).toBe(false);
    expect(classifyHttpStatus(500).retryable).toBe(true);
  });
});

describe("idempotency", () => {
  it("keeps credit and analysis hashes stable for the same input", () => {
    expect(analysisCreditKey("proj_1")).toBe("project:proj_1:analysis");
    const hash = analysisInputHash({
      provider: "OPENAI",
      fullText: "abc",
      clipCount: 8,
      clipDurationMin: 15,
      clipDurationMax: 30,
      mode: "AUTOMATIC",
    });
    expect(
      analysisInputHash({
        provider: "OPENAI",
        fullText: "abc",
        clipCount: 8,
        clipDurationMin: 15,
        clipDurationMax: 30,
        mode: "AUTOMATIC",
      }),
    ).toBe(hash);
  });
});

describe("job states", () => {
  it("maps the real pipeline stages", () => {
    expect(PIPELINE_STAGES).toEqual([
      "UPLOADED",
      "PROBING",
      "AUDIO_EXTRACTING",
      "TRANSCRIBING",
      "ANALYZING",
      "CLIPPING",
      "READY",
    ]);
    expect(pipelineStageFromStatus("QUEUED")).toBe("UPLOADED");
    expect(pipelineStageFromStatus("PROBING")).toBe("PROBING");
    expect(pipelineStageFromStatus("AUDIO_EXTRACTING")).toBe("AUDIO_EXTRACTING");
    expect(pipelineStageFromStatus("GENERATING")).toBe("CLIPPING");
    expect(pipelineStageFromStatus("READY")).toBe("READY");
    expect(pipelineStageFromStatus("FAILED")).toBe("FAILED");
    expect(PIPELINE_DISPLAY_STEPS).toEqual([
      "Vídeo enviado",
      "Preparando o vídeo",
      "Preparando áudio",
      "Transcrevendo conteúdo",
      "Entendendo o conteúdo",
      "Procurando melhores momentos",
      "Criando clips",
      "Finalizando",
    ]);
    expect(pipelineDisplayIndex("UPLOADING")).toBe(0);
    expect(pipelineDisplayIndex("QUEUED")).toBe(1);
    expect(pipelineDisplayIndex("PROBING")).toBe(1);
    expect(pipelineDisplayIndex("AUDIO_EXTRACTING")).toBe(2);
    expect(pipelineDisplayIndex("TRANSCRIBING")).toBe(3);
    expect(pipelineDisplayIndex("ANALYZING", 55, "Analisando conteúdo")).toBe(4);
    expect(pipelineDisplayIndex("ANALYZING", 62, "Encontrando melhores momentos")).toBe(5);
    expect(pipelineDisplayIndex("CLIPPING")).toBe(6);
    expect(pipelineDisplayIndex("READY")).toBe(7);
  });
});

describe("provider metadata", () => {
  it("redacts secrets from public errors", () => {
    expect(sanitizePublicError("Bearer sk-abc Authorization fail")).not.toMatch(/sk-abc/);
    process.env.OPENAI_API_KEY = "sk-test-not-used";
    expect(getTranscriptionProvider().providerLabel).toBe("OPENAI");
    expect(getClipAnalysisProvider().providerLabel).toBe("OPENAI");
    expect(getClipAnalysisProvider().mocked).toBe(false);
  });
});
