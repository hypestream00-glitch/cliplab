export class PlanLimitError extends Error {
  constructor(message = "Você atingiu o limite do seu plano.") {
    super(message);
    this.name = "PlanLimitError";
  }
}

export function secondsFromDurationMs(durationMs: number) {
  return Math.max(1, Math.ceil(Math.max(0, durationMs) / 1000));
}

export function minutesFromSeconds(seconds: number) {
  return seconds / 60;
}

export function formatMinutesUsed(usedSeconds: number, limitMinutes: number) {
  const used = minutesFromSeconds(usedSeconds);
  const usedLabel = used < 10 ? used.toFixed(1).replace(/\.0$/, "") : String(Math.round(used));
  return `${usedLabel} de ${limitMinutes} minutos utilizados`;
}

export function processingIdempotencyKey(projectId: string) {
  return `process:${projectId}`;
}
