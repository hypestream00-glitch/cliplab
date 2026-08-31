export class YouTubeApiError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status: number,
    public readonly retryable: boolean,
  ) {
    super(message);
    this.name = "YouTubeApiError";
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function retryAfterMs(response: Response, attempt: number) {
  const header = response.headers.get("retry-after");
  if (header) {
    const seconds = Number(header);
    if (Number.isFinite(seconds) && seconds >= 0) return Math.min(60_000, seconds * 1000);
  }
  return Math.min(16_000, 1000 * 2 ** attempt);
}

export async function youtubeFetch(url: string, init: RequestInit = {}, options: { attempts?: number; timeoutMs?: number } = {}) {
  const attempts = options.attempts ?? 3;
  const timeoutMs = options.timeoutMs ?? 120_000;
  let lastError: Error | null = null;
  for (let i = 0; i < attempts; i++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { ...init, signal: controller.signal });
      if (response.status === 429 || response.status === 500 || response.status === 502 || response.status === 503 || response.status === 504) {
        lastError = new YouTubeApiError(
          response.status === 429 ? "Quota/rate limit do YouTube." : `YouTube indisponível (${response.status}).`,
          response.status === 429 ? "quota_exceeded" : "unavailable",
          response.status,
          true,
        );
        if (i === attempts - 1) throw lastError;
        await sleep(retryAfterMs(response, i));
        continue;
      }
      return response;
    } catch (error) {
      if (error instanceof YouTubeApiError) throw error;
      const aborted = error instanceof Error && error.name === "AbortError";
      lastError = new YouTubeApiError(
        aborted ? "Timeout na API do YouTube." : "Falha de rede ao chamar o YouTube.",
        aborted ? "timeout" : "network",
        0,
        true,
      );
      if (i === attempts - 1) throw lastError;
      await sleep(retryAfterMs(new Response(null, { status: 503 }), i));
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError ?? new YouTubeApiError("Falha após retries no YouTube.", "unknown", 0, false);
}

export function parseYouTubeError(payload: unknown, status: number): YouTubeApiError {
  const body = payload as {
    error?: string | { message?: string; status?: string; errors?: Array<{ reason?: string; message?: string; domain?: string }> };
    error_description?: string;
  };
  if (typeof body.error === "string") {
    return new YouTubeApiError(youtubeUserMessage(body.error, body.error_description), body.error, status, status >= 500);
  }
  const err = body.error && typeof body.error === "object" ? body.error : undefined;
  const reason = err?.errors?.[0]?.reason ?? err?.status ?? "youtube_error";
  const retryable = reason === "quotaExceeded" || reason === "rateLimitExceeded" || reason === "backendError" || status >= 500;
  return new YouTubeApiError(youtubeUserMessage(reason, err?.message), reason, status, retryable);
}

export function youtubeUserMessage(code: string, fallback?: string) {
  const map: Record<string, string> = {
    not_configured: "YouTube não está configurado (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET).",
    access_denied: "Autorização recusada no Google.",
    invalid_grant: "Código ou refresh token inválido. Reconecte o YouTube.",
    quotaExceeded: "Quota diária da YouTube Data API esgotada. Tente amanhã ou solicite aumento.",
    uploadLimitExceeded: "Limite diário de uploads do canal atingido.",
    youtubeSignupRequired: "Esta conta Google não tem canal YouTube.",
    forbidden: "Permissão recusada. Reconecte e aceite youtube.upload.",
    failedPrecondition: "Canal indisponível ou restrição do YouTube.",
    invalid_video: "Vídeo inválido para o YouTube.",
    processingFailure: "O YouTube não processou o vídeo.",
    permission_denied: "Sem permissão para esta operação no YouTube.",
  };
  return map[code] ?? fallback ?? `YouTube recusou a operação (${code}).`;
}

export function mapYouTubeVideoStatus(params: {
  uploadStatus?: string;
  processingStatus?: string;
  rejectionReason?: string;
  failureReason?: string;
}): { status: "UPLOADING" | "PROCESSING" | "PUBLISHED" | "FAILED"; error?: string } {
  if (params.rejectionReason || params.failureReason || params.uploadStatus === "failed" || params.uploadStatus === "rejected") {
    return { status: "FAILED", error: params.rejectionReason ?? params.failureReason ?? "Upload recusado" };
  }
  if (params.processingStatus === "failed" || params.processingStatus === "terminated") {
    return { status: "FAILED", error: "Processamento falhou no YouTube." };
  }
  if (params.uploadStatus === "processed" && (params.processingStatus === "succeeded" || !params.processingStatus)) {
    return { status: "PUBLISHED" };
  }
  if (params.uploadStatus === "uploaded" || params.processingStatus === "processing") return { status: "PROCESSING" };
  if (params.uploadStatus === "deleted") return { status: "FAILED", error: "Vídeo removido." };
  return { status: "PROCESSING" };
}
