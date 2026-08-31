export type TranscriptWord = {
  startMs: number;
  endMs: number;
  text: string;
  confidence?: number;
};

export type TranscriptSegmentInput = {
  startMs: number;
  endMs: number;
  text: string;
  speakerId?: string;
  confidence?: number;
  words?: TranscriptWord[];
};

export type TranscriptionUsage = {
  seconds?: number;
};

export type TranscriptionResult = {
  fullText: string;
  segments: TranscriptSegmentInput[];
  provider: "OPENAI" | "MOCK";
  model?: string;
  language?: string;
  usage?: TranscriptionUsage;
};

export interface TranscriptionProvider {
  id: string;
  mocked: boolean;
  providerLabel: "OPENAI" | "MOCK";
  transcribe(params: { durationMs: number; language: string; audioPath?: string }): Promise<TranscriptionResult>;
}
