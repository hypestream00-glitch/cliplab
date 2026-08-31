export class AiConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiConfigurationError";
  }
}

export function openaiApiKey() {
  return process.env.OPENAI_API_KEY?.trim() ?? "";
}

/** Real AI when a server-side key exists. Dev/test may fall back to labeled MOCK. Production never silently mocks. */
export function resolveAiMode(source: NodeJS.ProcessEnv = process.env): "real" | "mock" {
  if (source.OPENAI_API_KEY?.trim()) return "real";
  if (source.NODE_ENV === "production") {
    throw new AiConfigurationError("OPENAI_API_KEY ausente em produção. Transcrição e análise reais são obrigatórias.");
  }
  return "mock";
}

export function openaiConfigured() {
  return Boolean(openaiApiKey());
}

export function sanitizePublicError(message: string) {
  return message
    .replace(/sk-[a-zA-Z0-9_-]+/g, "[redacted]")
    .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/api[_-]?key[=:]\s*\S+/gi, "api_key=[redacted]")
    .replace(/\n+/g, " ")
    .slice(0, 400);
}
