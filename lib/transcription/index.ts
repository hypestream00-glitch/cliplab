export type {
  TranscriptWord,
  TranscriptSegmentInput,
  TranscriptionResult,
  TranscriptionProvider,
} from "@/lib/transcription/types";
export { mockTranscriptionProvider } from "@/lib/transcription/mock";
export { getTranscriptionProvider } from "@/lib/transcription/openai";
