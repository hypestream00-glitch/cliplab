import type { AIProvider, CandidateClip, TranscriptInput } from "@/lib/ai/provider";
import { openaiConfigured } from "@/lib/ai/policy";
import { getClipAnalysisProvider } from "@/lib/services/clip-detection";

export const mockAIProvider: AIProvider = {
  id: "mock-ai",
  mocked: true,
  async analyze(input: TranscriptInput): Promise<CandidateClip[]> {
    const result = await getClipAnalysisProvider().analyze(input);
    return result.clips.map((clip) => ({
      startTime: clip.startMs,
      endTime: clip.endMs,
      title: clip.title,
      summary: clip.summary,
      reason: clip.reason,
      score: 50,
      hookScore: clip.hookScore,
      retentionScore: clip.retentionScore,
      clarityScore: clip.clarityScore,
      emotionScore: clip.emotionScore,
      shareabilityScore: clip.shareabilityScore,
      suggestedCaption: clip.suggestedCaption,
      suggestedHashtags: clip.suggestedHashtags,
    }));
  },
};

export function getAIProvider(): AIProvider {
  const provider = getClipAnalysisProvider();
  return {
    id: provider.id,
    mocked: provider.mocked || !openaiConfigured(),
    async analyze(input) {
      const result = await provider.analyze(input);
      return result.clips.map((clip) => ({
        startTime: clip.startMs,
        endTime: clip.endMs,
        title: clip.title,
        summary: clip.summary,
        reason: clip.reason,
        score: clip.hookScore,
        hookScore: clip.hookScore,
        retentionScore: clip.retentionScore,
        clarityScore: clip.clarityScore,
        emotionScore: clip.emotionScore,
        shareabilityScore: clip.shareabilityScore,
        suggestedCaption: clip.suggestedCaption,
        suggestedHashtags: clip.suggestedHashtags,
      }));
    },
  };
}
