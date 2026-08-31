export type CandidateClip = {
  startTime: number;
  endTime: number;
  title: string;
  summary: string;
  reason: string;
  score: number;
  hookScore: number;
  retentionScore: number;
  clarityScore: number;
  emotionScore: number;
  shareabilityScore?: number;
  suggestedCaption?: string;
  suggestedHashtags?: string[];
};

export type TranscriptInput = {
  language: string;
  durationMs: number;
  segments: Array<{ startMs: number; endMs: number; text: string; speakerId?: string }>;
  metadata: Record<string, unknown>;
};

export interface AIProvider {
  id: string;
  mocked: boolean;
  analyze(input: TranscriptInput): Promise<CandidateClip[]>;
}

export function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}
