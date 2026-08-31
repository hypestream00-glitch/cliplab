export class TikTokApiError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status: number,
    public readonly retryable: boolean,
  ) {
    super(message);
    this.name = "TikTokApiError";
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

export async function tiktokFetch(
  url: string,
  init: RequestInit,
  options: { attempts?: number; timeoutMs?: number } = {},
) {
  const attempts = options.attempts ?? 3;
  const timeoutMs = options.timeoutMs ?? 60_000;
  let lastError: Error | null = null;
  for (let i = 0; i < attempts; i++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { ...init, signal: controller.signal });
      if (response.status === 429 || response.status >= 500) {
        lastError = new TikTokApiError(
          response.status === 429 ? "Rate limit do TikTok (429)." : `TikTok indisponível (${response.status}).`,
          response.status === 429 ? "rate_limit_exceeded" : "unavailable",
          response.status,
          true,
        );
        if (i === attempts - 1) throw lastError;
        await sleep(retryAfterMs(response, i));
        continue;
      }
      return response;
    } catch (error) {
      if (error instanceof TikTokApiError) throw error;
      const aborted = error instanceof Error && error.name === "AbortError";
      lastError = new TikTokApiError(
        aborted ? "Timeout na API do TikTok." : "Falha de rede ao chamar o TikTok.",
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
  throw lastError ?? new TikTokApiError("Falha após retries no TikTok.", "unknown", 0, false);
}

export function parseTikTokError(payload: unknown, status: number): TikTokApiError {
  const body = payload as {
    error?: string | { code?: string; message?: string };
    error_description?: string;
    error_code?: string;
  };
  if (typeof body.error === "string") {
    return new TikTokApiError(body.error_description || tiktokUserMessage(body.error), body.error, status, status === 429 || status >= 500);
  }
  if (body.error && typeof body.error === "object") {
    const code = body.error.code ?? "unknown";
    if (code === "ok") {
      return new TikTokApiError("Erro inesperado.", "unknown", status, false);
    }
    return new TikTokApiError(body.error.message || tiktokUserMessage(code), code, status, code === "rate_limit_exceeded" || status >= 500);
  }
  return new TikTokApiError("Resposta inválida do TikTok.", "invalid_response", status, false);
}

export function tiktokUserMessage(code: string) {
  const map: Record<string, string> = {
    access_denied: "Autorização recusada no TikTok.",
    invalid_request: "Pedido OAuth inválido. Confira o redirect URI cadastrado.",
    invalid_grant: "Código de autorização inválido ou já usado.",
    invalid_client: "TIKTOK_CLIENT_KEY ou TIKTOK_CLIENT_SECRET inválidos.",
    access_token_invalid: "Token TikTok expirado ou inválido. Reconecte a conta.",
    scope_not_authorized: "A conta não concedeu o escopo necessário (video.publish ou métricas).",
    rate_limit_exceeded: "Rate limit do TikTok. Aguarde e tente de novo.",
    spam_risk_too_many_posts: "Limite diário de posts da API atingido para este criador.",
    spam_risk_user_banned_from_posting: "Este criador está impedido de publicar.",
    reached_active_user_cap: "Cota diária de usuários ativos do app atingida.",
    privacy_level_option_mismatch: "A privacidade escolhida não está disponível para esta conta.",
    url_ownership_unverified: "Domínio não verificado para PULL_FROM_URL.",
    file_format_check_failed: "Formato de vídeo não suportado pelo TikTok.",
    duration_check_failed: "Duração fora do permitido para este criador.",
    picture_size_check_failed: "Resolução fora dos limites do TikTok (360–4096 px).",
  };
  return map[code] ?? `TikTok recusou a operação (${code}).`;
}
