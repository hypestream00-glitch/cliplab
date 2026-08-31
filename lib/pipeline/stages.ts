export const PIPELINE_STAGES = [
  "UPLOADED",
  "PROBING",
  "AUDIO_EXTRACTING",
  "TRANSCRIBING",
  "ANALYZING",
  "CLIPPING",
  "READY",
] as const;

export type PipelineStage = (typeof PIPELINE_STAGES)[number];

export const PIPELINE_DISPLAY_STEPS = [
  "Vídeo enviado",
  "Preparando o vídeo",
  "Preparando áudio",
  "Transcrevendo conteúdo",
  "Entendendo o conteúdo",
  "Procurando melhores momentos",
  "Criando clips",
  "Finalizando",
] as const;

export const PIPELINE_STAGE_LABELS: Record<PipelineStage | "FAILED", string> = {
  UPLOADED: "Recebendo seu vídeo",
  PROBING: "Preparando o vídeo",
  AUDIO_EXTRACTING: "Preparando o áudio",
  TRANSCRIBING: "Estamos entendendo o conteúdo do seu vídeo.",
  ANALYZING: "Procurando momentos com maior potencial.",
  CLIPPING: "Criando seus clips.",
  READY: "Seus clips estão prontos.",
  FAILED: "Não conseguimos processar seu vídeo.",
};

export function pipelineDisplayIndex(status: string | null | undefined, progress = 0, message?: string | null) {
  const stage = pipelineStageFromStatus(status);
  if (stage === "FAILED") return -1;
  if (status === "CREATED" || status === "UPLOADING") return 0;
  if (stage === "UPLOADED" || stage === "PROBING") return 1;
  if (stage === "AUDIO_EXTRACTING") return 2;
  if (stage === "TRANSCRIBING") return 3;
  if (stage === "ANALYZING") {
    const finding = progress >= 60 || /melhores momentos/i.test(message ?? "");
    return finding ? 5 : 4;
  }
  if (stage === "CLIPPING") return 6;
  return 7;
}

const STATUS_TO_STAGE: Record<string, PipelineStage> = {
  CREATED: "UPLOADED",
  UPLOADING: "UPLOADED",
  QUEUED: "UPLOADED",
  PROCESSING: "PROBING",
  PROBING: "PROBING",
  AUDIO_EXTRACTING: "AUDIO_EXTRACTING",
  TRANSCRIBING: "TRANSCRIBING",
  ANALYZING: "ANALYZING",
  GENERATING: "CLIPPING",
  CLIPPING: "CLIPPING",
  READY: "READY",
};

export function pipelineStageFromStatus(status: string | null | undefined): PipelineStage | "FAILED" {
  if (!status) return "UPLOADED";
  if (status === "FAILED" || status === "CANCELED") return "FAILED";
  return STATUS_TO_STAGE[status] ?? "UPLOADED";
}

export function pipelineStageIndex(status: string | null | undefined) {
  const stage = pipelineStageFromStatus(status);
  if (stage === "FAILED") return -1;
  return PIPELINE_STAGES.indexOf(stage);
}

export function normalizeExecutionBadge(value: unknown): "REAL" | "MOCK" | "PENDING" {
  const raw = String(value ?? "").trim().toUpperCase();
  if (!raw || raw === "PENDING") return "PENDING";
  if (raw === "OPENAI" || raw === "REAL") return "REAL";
  if (raw === "MOCK") return "MOCK";
  return "PENDING";
}
