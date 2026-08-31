import type { TranscriptionProvider, TranscriptSegmentInput } from "@/lib/transcription/types";

export const mockTranscriptionProvider: TranscriptionProvider = {
  id: "mock-transcription",
  mocked: true,
  providerLabel: "MOCK",
  async transcribe({ durationMs }) {
    const step = 4200;
    const segments: TranscriptSegmentInput[] = [];
    const speakers = ["spk_1", "spk_2"];
    const lines = [
      "Vamos começar pelo ponto que mais importa nesse vídeo.",
      "Aqui o ritmo sobe e o chat explode.",
      "Isso aqui é o gancho perfeito para um corte curto.",
      "Presta atenção nessa reação, ela segura a retenção.",
      "A virada acontece exatamente neste trecho.",
      "Fecha com um call to action claro para o próximo conteúdo.",
    ];
    let t = 0;
    let i = 0;
    while (t < durationMs) {
      const end = Math.min(durationMs, t + step);
      const text = lines[i % lines.length];
      const words = text.split(" ").map((word, index, all) => {
        const span = (end - t) / all.length;
        return { startMs: Math.round(t + index * span), endMs: Math.round(t + (index + 1) * span), text: word };
      });
      segments.push({
        startMs: t,
        endMs: end,
        text: `[MOCK] ${text}`,
        speakerId: speakers[i % speakers.length],
        confidence: 0.4,
        words,
      });
      t = end;
      i += 1;
    }
    return {
      provider: "MOCK",
      model: "mock",
      fullText: `[MOCK — OPENAI_API_KEY ausente. Texto sintético, não extraído do áudio.] ${segments.map((s) => s.text).join(" ")}`,
      segments,
    };
  },
};
