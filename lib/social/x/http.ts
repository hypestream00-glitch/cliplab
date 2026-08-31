export class XApiError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status: number,
    public readonly retryable: boolean,
  ) {
    super(message);
    this.name = "XApiError";
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
  const reset = Number(response.headers.get("x-rate-limit-reset"));
  if (Number.isFinite(reset) && reset > 0) {
    const wait = reset * 1000 - Date.now();
    if (wait > 0) return Math.min(60_000, wait);
  }
  return Math.min(16_000, 1000 * 2 ** attempt);
}

export function parseXRateLimit(response: Response) {
  const remaining = Number(response.headers.get("x-rate-limit-remaining"));
  const limit = Number(response.headers.get("x-rate-limit-limit"));
  const reset = Number(response.headers.get("x-rate-limit-reset"));
  return {
    remaining: Number.isFinite(remaining) ? remaining : null,
    limit: Number.isFinite(limit) ? limit : null,
    reset: Number.isFinite(reset) ? reset : null,
  };
}

export async function xFetch(url: string, init: RequestInit = {}, options: { attempts?: number; timeoutMs?: number } = {}) {
  const attempts = options.attempts ?? 3;
  const timeoutMs = options.timeoutMs ?? 60_000;
  let lastError: Error | null = null;
  for (let i = 0; i < attempts; i++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { ...init, signal: controller.signal });
      if (response.status === 429 || response.status >= 500) {
        lastError = new XApiError(
          response.status === 429 ? "Rate limit da API do X (429)." : `API do X indisponível (${response.status}).`,
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
      if (error instanceof XApiError) throw error;
      const aborted = error instanceof Error && error.name === "AbortError";
      lastError = new XApiError(
        aborted ? "Timeout na API do X." : "Falha de rede ao chamar o X.",
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
  throw lastError ?? new XApiError("Falha após retries na API do X.", "unknown", 0, false);
}

export function parseXError(payload: unknown, status: number): XApiError {
  const body = payload as {
    error?: string;
    error_description?: string;
    title?: string;
    detail?: string;
    type?: string;
    status?: number;
    errors?: Array<{ message?: string; code?: string }>;
  };
  if (body.error) {
    const code = String(body.error);
    return new XApiError(xUserMessage(code, body.error_description), code, status, status === 429 || status >= 500);
  }
  if (body.title || body.detail) {
    const code = planRestriction(body.title, body.detail, status) ? "plan_restriction" : String(body.title ?? "x_error");
    return new XApiError(xUserMessage(code, body.detail || body.title), code, status, false);
  }
  if (body.errors?.[0]) {
    const first = body.errors[0];
    return new XApiError(first.message ?? "Erro da API do X.", String(first.code ?? "x_error"), status, status === 429);
  }
  return new XApiError("Resposta inválida da API do X.", "invalid_response", status, false);
}

function planRestriction(title?: string, detail?: string, status?: number) {
  const text = `${title ?? ""} ${detail ?? ""}`.toLowerCase();
  return (
    status === 402 ||
    status === 403 && (text.includes("not permitted") || text.includes("access level") || text.includes("upgrade") || text.includes("product") || text.includes("client-not-enrolled"))
  );
}

export function xUserMessage(code: string, fallback?: string) {
  const map: Record<string, string> = {
    not_configured: "X não está configurado (X_CLIENT_ID / X_CLIENT_SECRET).",
    access_denied: "Autorização recusada no X.",
    invalid_grant: "Código de autorização inválido ou já usado.",
    invalid_request: "Pedido OAuth inválido. Confira o redirect URI.",
    rate_limit_exceeded: "Rate limit da API do X. Aguarde e tente de novo.",
    plan_restriction: "O plano/tier da API do X não permite esta operação. É necessário Basic, Pro ou Enterprise com write.",
    api_access_required: "O app ainda não tem acesso de escrita na API do X.",
    missing_scope: "Escopo ausente. Reconecte e aceite tweet.write e media.write.",
    media_upload_failed: "Falha no upload de mídia no X.",
    media_processing_failed: "O X não processou o vídeo.",
    post_failed: "Falha ao criar o post no X.",
  };
  return map[code] ?? fallback ?? `X recusou a operação (${code}).`;
}
