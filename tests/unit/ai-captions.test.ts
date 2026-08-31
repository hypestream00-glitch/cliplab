import { describe, expect, it } from "vitest";
import { validateClipWindow, InvalidVideoError } from "@/lib/media/validate";
import { normalizeTranscript } from "@/lib/transcription/normalize";
import { formatCaptions, currentWord } from "@/lib/captions/format";
import { removeOverlappingCandidates, overlapRatio } from "@/lib/ai/overlap";
import { compositeViralScore, CLIP_SCORE_WEIGHTS } from "@/lib/config/clip-score";
import { parseClipAnalysisJson } from "@/lib/ai/clip-schema";
import { getTranscriptionProvider } from "@/lib/transcription";
import { getClipAnalysisProvider } from "@/lib/services/clip-detection";

describe("timestamp validation", () => {
  it("rejects invalid clip windows", () => {
    expect(() => validateClipWindow(-1, 10, 100)).toThrow(InvalidVideoError);
    expect(() => validateClipWindow(0, 200, 100)).toThrow(InvalidVideoError);
    expect(() => validateClipWindow(20, 10, 100)).toThrow(InvalidVideoError);
  });
});

describe("transcript normalization", () => {
  it("drops empty segments and fixes overlap without inventing words", () => {
    const result = normalizeTranscript(
      [
        { startMs: 0, endMs: 1000, text: "  olá   mundo " },
        { startMs: 800, endMs: 2000, text: "segunda" },
        { startMs: 10, endMs: 20, text: "   " },
      ],
      5000,
    );
    expect(result).toHaveLength(2);
    expect(result[0].text).toBe("olá mundo");
    expect(result[1].startMs).toBe(1000);
  });
});

describe("caption formatting", () => {
  it("wraps without changing words", () => {
    const cues = formatCaptions(
      [{ startMs: 0, endMs: 4000, text: "um dois tres quatro cinco seis sete oito" }],
      { maxWordsPerLine: 3, maxCharactersPerLine: 40, maxLines: 1 },
    );
    expect(cues.length).toBeGreaterThan(1);
    expect(cues.map((cue) => cue.text).join(" ")).toContain("um");
    expect(cues.map((cue) => cue.text).join(" ")).toContain("oito");
  });
  it("finds the current word", () => {
    const cues = [
      {
        startMs: 0,
        endMs: 3000,
        text: "olá mundo",
        words: [
          { startMs: 0, endMs: 1000, text: "olá" },
          { startMs: 1000, endMs: 3000, text: "mundo" },
        ],
      },
    ];
    expect(currentWord(cues, 1500)?.word).toBe("mundo");
  });
});

describe("overlap removal", () => {
  it("keeps the higher score", () => {
    const kept = removeOverlappingCandidates(
      [
        { startMs: 0, endMs: 10_000, score: 40 },
        { startMs: 1000, endMs: 9000, score: 90 },
        { startMs: 20_000, endMs: 25_000, score: 70 },
      ],
      0.4,
    );
    expect(kept).toHaveLength(2);
    expect(kept[0].score).toBe(90);
    expect(overlapRatio(kept[0], kept[1])).toBe(0);
  });
});

describe("score calculation", () => {
  it("uses configured weights", () => {
    const sum = Object.values(CLIP_SCORE_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1, 5);
    expect(
      compositeViralScore({
        hookScore: 100,
        retentionScore: 0,
        emotionScore: 0,
        clarityScore: 0,
        shareabilityScore: 0,
      }),
    ).toBe(28);
  });
});

describe("structured AI output", () => {
  it("rejects invalid json", () => {
    expect(() => parseClipAnalysisJson("{bad")).toThrow();
    expect(() => parseClipAnalysisJson(JSON.stringify({ clips: [] }))).toThrow();
  });
  it("accepts a valid clip list", () => {
    const clips = parseClipAnalysisJson(
      JSON.stringify({
        clips: [
          {
            startMs: 1000,
            endMs: 8000,
            title: "Hook",
            summary: "Resumo",
            reason: "Reação forte",
            hookScore: 80,
            retentionScore: 70,
            clarityScore: 60,
            emotionScore: 90,
            shareabilityScore: 75,
            suggestedCaption: "wow",
            suggestedHashtags: ["clip"],
          },
        ],
      }),
    );
    expect(clips[0].title).toBe("Hook");
  });
});

describe("provider selection", () => {
  it("uses mock transcription and analysis when no key is present", () => {
    const previous = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    expect(getTranscriptionProvider().mocked).toBe(true);
    expect(getTranscriptionProvider().providerLabel).toBe("MOCK");
    expect(getClipAnalysisProvider().providerLabel).toBe("MOCK");
    if (previous) process.env.OPENAI_API_KEY = previous;
  });
  it("selects OPENAI providers when a key is present without calling the API", () => {
    const previous = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = "sk-test-not-used";
    expect(getTranscriptionProvider().providerLabel).toBe("OPENAI");
    expect(getTranscriptionProvider().mocked).toBe(false);
    expect(getClipAnalysisProvider().providerLabel).toBe("OPENAI");
    expect(getClipAnalysisProvider().mocked).toBe(false);
    if (previous) process.env.OPENAI_API_KEY = previous;
    else delete process.env.OPENAI_API_KEY;
  });
});
