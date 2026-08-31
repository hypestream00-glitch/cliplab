import { isFfmpegAvailable } from "@/lib/ffmpeg";

export type CapabilityState = "REAL" | "MOCK" | "UNAVAILABLE" | "OPENAI";

export type ProcessingCapabilities = {
  video: CapabilityState;
  clipping: CapabilityState;
  render: CapabilityState;
  transcription: CapabilityState;
  analysis: CapabilityState;
};

export async function getProcessingCapabilities(): Promise<ProcessingCapabilities> {
  const ffmpeg = await isFfmpegAvailable();
  const openai = Boolean(process.env.OPENAI_API_KEY?.trim());
  return {
    video: ffmpeg ? "REAL" : "UNAVAILABLE",
    clipping: ffmpeg ? "REAL" : "UNAVAILABLE",
    render: ffmpeg ? "REAL" : "UNAVAILABLE",
    transcription: openai ? "REAL" : "MOCK",
    analysis: openai ? "REAL" : "MOCK",
  };
}

export function capabilityLabel(state: CapabilityState) {
  if (state === "REAL") return "REAL";
  if (state === "OPENAI") return "REAL";
  if (state === "MOCK") return "MOCK";
  return "INDISPONÍVEL";
}
