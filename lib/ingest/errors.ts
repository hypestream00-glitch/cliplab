export class IngestError extends Error {
  constructor(
    message: string,
    public code:
      | "invalid-url"
      | "blocked"
      | "unsupported"
      | "private"
      | "too-large"
      | "timeout"
      | "unavailable"
      | "not-video",
  ) {
    super(message);
    this.name = "IngestError";
  }
}

export function ingestErrorMessage(code: IngestError["code"]) {
  switch (code) {
    case "invalid-url":
      return "Link inválido.";
    case "blocked":
      return "URL de ingestão bloqueada.";
    case "unsupported":
      return "Este link ainda não é suportado.";
    case "private":
      return "Vídeo privado ou indisponível.";
    case "too-large":
      return "Arquivo excede limite do plano.";
    case "timeout":
      return "Não foi possível importar este conteúdo.";
    case "not-video":
      return "Formato não suportado. Envie MP4, MOV ou WEBM.";
    default:
      return "Não foi possível importar este conteúdo.";
  }
}
