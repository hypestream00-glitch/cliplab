import { logger } from "@/lib/logger";
import { backoffDelayMs, classifyOpenAiError, OpenAiHttpError } from "@/lib/ai/openai-error";

export type RecoverableHttpError = {
  status: number;
  retryable: boolean;
  message: string;
};

export function classifyHttpStatus(status: number): RecoverableHttpError {
  const classified = classifyOpenAiError({ status });
  return { status: classified.status, retryable: classified.retryable, message: classified.message };
}

export async function fetchWithBackoff(
  input: RequestInfo | URL,
  init: RequestInit,
  options: {
    attempts?: number;
    timeoutMs?: number;
    label?: string;
    sleep?: (ms: number) => Promise<void>;
    jitter?: boolean;
    random?: () => number;
  } = {},
) {
  const attempts = options.attempts ?? 3;
  const timeoutMs = options.timeoutMs ?? 90_000;
  const sleep = options.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  const jitter = options.jitter ?? true;
  let lastError: Error | null = null;
  for (let i = 0; i < attempts; i++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(input, { ...init, signal: controller.signal });
      if (response.ok) return response;
      const bodyText = await response.text().catch(() => "");
      const classified = classifyOpenAiError({
        status: response.status,
        bodyText,
        headers: response.headers,
      });
      logger.warn(
        {
          label: options.label,
          status: classified.status,
          type: classified.type,
          code: classified.code,
          kind: classified.kind,
          retryable: classified.retryable,
          attempt: i + 1,
        },
        "openai http error",
      );
      if (!classified.retryable || i === attempts - 1) throw classified;
      lastError = classified;
      const delay = backoffDelayMs(i, classified.retryAfterMs, jitter, options.random);
      await sleep(delay);
      continue;
    } catch (error) {
      if (error instanceof OpenAiHttpError) {
        if (!error.retryable || i === attempts - 1) throw error;
        lastError = error;
        const delay = backoffDelayMs(i, error.retryAfterMs, jitter, options.random);
        await sleep(delay);
        continue;
      }
      const aborted = error instanceof Error && error.name === "AbortError";
      const message = aborted ? "Timeout na OpenAI." : error instanceof Error ? error.message : "Falha de rede";
      lastError = new Error(message);
      const retryable = aborted || /Timeout|temporária|network|fetch/i.test(message);
      if (!retryable || i === attempts - 1) throw lastError;
    } finally {
      clearTimeout(timer);
    }
    const delay = backoffDelayMs(i, null, jitter, options.random);
    await sleep(delay);
  }
  throw lastError ?? new Error(options.label ?? "Falha após retries");
}
