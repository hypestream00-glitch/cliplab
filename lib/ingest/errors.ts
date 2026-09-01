export class IngestError extends Error {
  constructor(
    message: string,
    public code:
      | "invalid-url"
      | "blocked"
      | "unsupported"
      | "import-unavailable"
      | "private"
      | "not-found"
      | "too-large"
      | "timeout"
      | "unavailable"
      | "not-video"
      | "redirects"
      | "storage",
  ) {
    super(message);
    this.name = "IngestError";
  }
}

export const PERMANENT_INGEST_CODES: ReadonlySet<IngestError["code"]> = new Set([
  "invalid-url",
  "blocked",
  "unsupported",
  "import-unavailable",
  "private",
  "not-found",
  "too-large",
  "not-video",
  "redirects",
  "storage",
]);

export function isPermanentIngestError(error: unknown) {
  return error instanceof IngestError && PERMANENT_INGEST_CODES.has(error.code);
}

export function isTransientIngestError(error: unknown) {
  return error instanceof IngestError && (error.code === "timeout" || error.code === "unavailable");
}

export function ingestErrorMessage(code: IngestError["code"]) {
  switch (code) {
    case "invalid-url":
      return "Link inválido.";
    case "blocked":
      return "URL de ingestão bloqueada.";
    case "unsupported":
      return "Encontramos o vídeo, mas essa fonte não permite importação automática.";
    case "import-unavailable":
      return "Encontramos o vídeo, mas a importação automática desta fonte não está disponível para este conteúdo.";
    case "private":
      return "Este vídeo está privado ou indisponível.";
    case "not-found":
      return "Não encontramos esse vídeo.";
    case "too-large":
      return "O vídeo excede o limite do seu plano.";
    case "timeout":
      return "A importação demorou mais que o permitido.";
    case "not-video":
      return "Não foi possível validar a mídia.";
    case "redirects":
      return "A importação excedeu o limite de redirecionamentos.";
    case "storage":
      return "Não foi possível enviar o vídeo para o storage.";
    default:
      return "Não foi possível importar este conteúdo.";
  }
}
