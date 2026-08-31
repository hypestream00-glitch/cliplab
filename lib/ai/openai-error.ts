export type OpenAiErrorKind =
  | "insufficient_quota"
  | "rate_limit_exceeded"
  | "invalid_api_key"
  | "billing_required"
  | "permanent"
  | "temporary";

export class OpenAiHttpError extends Error {
  readonly status: number;
  readonly type: string | null;
  readonly code: string | null;
  readonly kind: OpenAiErrorKind;
  readonly retryable: boolean;
  readonly retryAfterMs: number | null;

  constructor(params: {
    status: number;
    type: string | null;
    code: string | null;
    kind: OpenAiErrorKind;
    retryable: boolean;
    retryAfterMs: number | null;
    message: string;
  }) {
    super(params.message);
    this.name = "OpenAiHttpError";
    this.status = params.status;
    this.type = params.type;
    this.code = params.code;
    this.kind = params.kind;
    this.retryable = params.retryable;
    this.retryAfterMs = params.retryAfterMs;
  }
}

export function publicOpenAiErrorMessage(kind: OpenAiErrorKind, status: number) {
  if (kind === "insufficient_quota") {
    return "OpenAI sem créditos/quota disponível. Verifique o faturamento da API.";
  }
  if (kind === "rate_limit_exceeded") {
    return "Limite temporário da OpenAI atingido. Tentaremos novamente.";
  }
  if (kind === "invalid_api_key") return "OPENAI_API_KEY inválida.";
  if (kind === "billing_required") {
    return "OpenAI sem créditos/quota disponível. Verifique o faturamento da API.";
  }
  if (status === 408) return "Timeout na OpenAI.";
  if (status >= 500) return `Falha temporária da OpenAI (${status}).`;
  if (status === 400 || status === 404) return `Erro permanente da OpenAI (${status}).`;
  if (status === 429) return "Limite temporário da OpenAI atingido. Tentaremos novamente.";
  return `Erro HTTP ${status}`;
}

export function parseRetryAfterMs(value: string | null, now = Date.now()) {
  if (!value?.trim()) return null;
  const seconds = Number(value.trim());
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(60_000, Math.round(seconds * 1000));
  const date = Date.parse(value);
  if (!Number.isNaN(date)) return Math.min(60_000, Math.max(0, date - now));
  return null;
}

function header(headers: Headers, name: string) {
  return headers.get(name) ?? headers.get(name.toLowerCase());
}

export function classifyOpenAiError(params: {
  status: number;
  bodyText?: string;
  headers?: Headers;
  now?: number;
}): OpenAiHttpError {
  let type: string | null = null;
  let code: string | null = null;
  let rawMessage = "";
  if (params.bodyText?.trim()) {
    try {
      const parsed = JSON.parse(params.bodyText) as {
        error?: { type?: string; code?: string; message?: string };
      };
      type = parsed.error?.type ?? null;
      code = parsed.error?.code ?? null;
      rawMessage = parsed.error?.message ?? "";
    } catch {
      rawMessage = params.bodyText.slice(0, 200);
    }
  }

  const combined = `${type ?? ""} ${code ?? ""} ${rawMessage}`.toLowerCase();
  let kind: OpenAiErrorKind = "temporary";
  if (params.status === 401 || params.status === 403 || combined.includes("invalid_api_key")) {
    kind = "invalid_api_key";
  } else if (
    code === "insufficient_quota" ||
    code === "credit_balance_exhausted" ||
    type === "insufficient_quota" ||
    combined.includes("insufficient_quota") ||
    combined.includes("credit_balance_exhausted") ||
    (combined.includes("quota") && combined.includes("billing"))
  ) {
    kind = "insufficient_quota";
  } else if (
    combined.includes("billing_not_active") ||
    combined.includes("billing_required") ||
    code === "billing_not_active"
  ) {
    kind = "billing_required";
  } else if (params.status === 429 || code === "rate_limit_exceeded" || type === "tokens") {
    kind = code === "rate_limit_exceeded" || combined.includes("rate_limit") || combined.includes("rate limit")
      ? "rate_limit_exceeded"
      : params.status === 429
        ? "rate_limit_exceeded"
        : "temporary";
  } else if (params.status === 400 || params.status === 404 || (params.status >= 400 && params.status < 500 && params.status !== 408)) {
    kind = "permanent";
  } else {
    kind = "temporary";
  }

  const retryable =
    kind === "rate_limit_exceeded" ||
    kind === "temporary" ||
    params.status === 408 ||
    params.status >= 500;

  return new OpenAiHttpError({
    status: params.status,
    type,
    code,
    kind,
    retryable,
    retryAfterMs: parseRetryAfterMs(params.headers ? header(params.headers, "retry-after") : null, params.now),
    message: publicOpenAiErrorMessage(kind, params.status),
  });
}

export function backoffDelayMs(attemptIndex: number, retryAfterMs: number | null, jitter: boolean, random = Math.random) {
  if (retryAfterMs != null && retryAfterMs > 0) return retryAfterMs;
  const base = Math.min(16_000, 1000 * 2 ** attemptIndex);
  if (!jitter) return base;
  return Math.round(base * (0.5 + random() * 0.5));
}
