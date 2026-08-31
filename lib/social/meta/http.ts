export class MetaApiError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status: number,
    public readonly retryable: boolean,
  ) {
    super(message);
    this.name = "MetaApiError";
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
  const usage = parseAppUsage(response);
  if (usage && usage >= 90) return 60_000;
  return Math.min(16_000, 1000 * 2 ** attempt);
}

export function parseAppUsage(response: Response) {
  const raw = response.headers.get("x-app-usage") ?? response.headers.get("x-business-use-case-usage");
  if (!raw) return null;
  try {
    const json = JSON.parse(raw) as { call_count?: number } | Record<string, Array<{ call_count?: number }>>;
    if (typeof (json as { call_count?: number }).call_count === "number") {
      return Number((json as { call_count?: number }).call_count);
    }
    const first = Object.values(json)[0];
    if (Array.isArray(first) && first[0]?.call_count != null) return Number(first[0].call_count);
  } catch {
    return null;
  }
  return null;
}

export async function metaFetch(url: string, init: RequestInit = {}, options: { attempts?: number; timeoutMs?: number } = {}) {
  const attempts = options.attempts ?? 3;
  const timeoutMs = options.timeoutMs ?? 60_000;
  let lastError: Error | null = null;
  for (let i = 0; i < attempts; i++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { ...init, signal: controller.signal });
      if (response.status === 429 || response.status >= 500) {
        lastError = new MetaApiError(
          response.status === 429 ? "Rate limit da Graph API (429)." : `Graph API indisponível (${response.status}).`,
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
      if (error instanceof MetaApiError) throw error;
      const aborted = error instanceof Error && error.name === "AbortError";
      lastError = new MetaApiError(
        aborted ? "Timeout na Graph API." : "Falha de rede ao chamar a Meta.",
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
  throw lastError ?? new MetaApiError("Falha após retries na Graph API.", "unknown", 0, false);
}

export function parseMetaError(payload: unknown, status: number): MetaApiError {
  const body = payload as {
    error?: { message?: string; type?: string; code?: number; error_subcode?: number; error_user_msg?: string };
    error_description?: string;
  };
  const err = body.error;
  if (err) {
    const code = String(err.code ?? err.type ?? "unknown");
    const retryable = status === 429 || status >= 500 || err.code === 4 || err.code === 17 || err.code === 32 || err.code === 613;
    return new MetaApiError(metaUserMessage(code, err.error_user_msg || err.message), code, status, retryable);
  }
  if (body.error_description) {
    return new MetaApiError(body.error_description, "oauth", status, false);
  }
  return new MetaApiError("Resposta inválida da Graph API.", "invalid_response", status, false);
}

export function metaUserMessage(code: string, fallback?: string) {
  const map: Record<string, string> = {
    "190": "Token Meta expirado ou inválido. Reconecte a conta.",
    "10": "Permissão ausente. Reconecte e aceite as permissões do app.",
    "200": "Permissão recusada ou não aprovada (App Review).",
    "4": "Rate limit da Graph API. Aguarde e tente de novo.",
    "17": "Limite de uso da conta atingido.",
    "32": "Limite de chamada da Página atingido.",
    "613": "Rate limit da Graph API.",
    "24": "Mídia inválida para o Instagram.",
    "100": "Parâmetro inválido na Graph API.",
    "368": "Ação bloqueada temporariamente pela Meta.",
    access_denied: "Autorização recusada no Facebook/Instagram.",
    invalid_grant: "Código de autorização inválido ou já usado.",
    not_configured: "Meta não está configurada (META_APP_ID / META_APP_SECRET).",
    localhost_url: "A Meta não consegue buscar localhost. Use HTTPS público (META_MEDIA_BASE_URL).",
    unsupported_account: "Esta conta Instagram não é profissional ou não está vinculada a uma Página.",
    missing_task: "Você não tem permissão CREATE_CONTENT nesta Página.",
    container_error: "O Instagram não conseguiu processar o vídeo.",
    container_expired: "O container do Instagram expirou (24h). Publique de novo.",
  };
  return map[code] ?? fallback ?? `Meta recusou a operação (${code}).`;
}
