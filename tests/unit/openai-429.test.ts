import { afterEach, describe, expect, it, vi } from "vitest";
import {
  backoffDelayMs,
  classifyOpenAiError,
  parseRetryAfterMs,
  publicOpenAiErrorMessage,
} from "@/lib/ai/openai-error";
import { fetchWithBackoff } from "@/lib/http/retry";
import { resumeJobDecision } from "@/lib/pipeline/resume-decision";
import { getTranscriptionProvider } from "@/lib/transcription/openai";
import { getClipAnalysisProvider } from "@/lib/services/clip-detection";
import { resolveAiMode } from "@/lib/ai/policy";

const originalFetch = globalThis.fetch;
const originalKey = process.env.OPENAI_API_KEY;

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalKey) process.env.OPENAI_API_KEY = originalKey;
  else delete process.env.OPENAI_API_KEY;
});

function openaiJson(status: number, type: string, code: string, message: string, headers?: Record<string, string>) {
  return new Response(JSON.stringify({ error: { type, code, message } }), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

describe("openai 429 classification", () => {
  it("treats insufficient_quota / credit_balance_exhausted as non-retryable quota", () => {
    const error = classifyOpenAiError({
      status: 429,
      bodyText: JSON.stringify({
        error: {
          type: "insufficient_quota",
          code: "credit_balance_exhausted",
          message: "You have no credits remaining.",
        },
      }),
    });
    expect(error.kind).toBe("insufficient_quota");
    expect(error.retryable).toBe(false);
    expect(error.type).toBe("insufficient_quota");
    expect(error.code).toBe("credit_balance_exhausted");
    expect(error.message).toBe(publicOpenAiErrorMessage("insufficient_quota", 429));
  });

  it("treats rate_limit_exceeded as retryable", () => {
    const error = classifyOpenAiError({
      status: 429,
      bodyText: JSON.stringify({
        error: { type: "tokens", code: "rate_limit_exceeded", message: "Rate limit reached for rpm" },
      }),
      headers: new Headers({ "retry-after": "2" }),
    });
    expect(error.kind).toBe("rate_limit_exceeded");
    expect(error.retryable).toBe(true);
    expect(error.retryAfterMs).toBe(2000);
    expect(error.message).toBe(publicOpenAiErrorMessage("rate_limit_exceeded", 429));
  });

  it("parses Retry-After HTTP dates", () => {
    const now = Date.parse("Wed, 21 Oct 2015 07:28:00 GMT");
    expect(parseRetryAfterMs("Wed, 21 Oct 2015 07:28:05 GMT", now)).toBe(5000);
  });
});

describe("openai backoff", () => {
  it("uses exponential delay and Retry-After when present", () => {
    expect(backoffDelayMs(0, null, false)).toBe(1000);
    expect(backoffDelayMs(1, null, false)).toBe(2000);
    expect(backoffDelayMs(2, null, false)).toBe(4000);
    expect(backoffDelayMs(0, 2500, true)).toBe(2500);
    const jittered = backoffDelayMs(0, null, true, () => 0);
    expect(jittered).toBe(500);
  });
});

describe("openai fetch retries", () => {
  it("does not retry insufficient_quota", async () => {
    let calls = 0;
    globalThis.fetch = vi.fn(async () => {
      calls += 1;
      return openaiJson(429, "insufficient_quota", "credit_balance_exhausted", "You have no credits remaining.");
    }) as unknown as typeof fetch;
    const sleeps: number[] = [];
    await expect(
      fetchWithBackoff("https://example.invalid/quota", { method: "POST" }, { attempts: 3, sleep: async (ms) => { sleeps.push(ms); }, jitter: false }),
    ).rejects.toMatchObject({ kind: "insufficient_quota", retryable: false, status: 429 });
    expect(calls).toBe(1);
    expect(sleeps).toEqual([]);
    globalThis.fetch = originalFetch;
  });

  it("retries rate_limit_exceeded with Retry-After then succeeds", async () => {
    let calls = 0;
    globalThis.fetch = vi.fn(async () => {
      calls += 1;
      if (calls === 1) {
        return openaiJson(429, "tokens", "rate_limit_exceeded", "Rate limit reached", { "retry-after": "2" });
      }
      return new Response("ok", { status: 200 });
    }) as unknown as typeof fetch;
    const sleeps: number[] = [];
    const ok = await fetchWithBackoff(
      "https://example.invalid/rpm",
      { method: "GET" },
      { attempts: 3, sleep: async (ms) => { sleeps.push(ms); }, jitter: false },
    );
    expect(ok.status).toBe(200);
    expect(calls).toBe(2);
    expect(sleeps).toEqual([2000]);
    globalThis.fetch = originalFetch;
  });

  it("stops after max retries on rate_limit_exceeded", async () => {
    let calls = 0;
    globalThis.fetch = vi.fn(async () => {
      calls += 1;
      return openaiJson(429, "tokens", "rate_limit_exceeded", "Rate limit reached");
    }) as unknown as typeof fetch;
    await expect(
      fetchWithBackoff("https://example.invalid/max", { method: "GET" }, { attempts: 3, sleep: async () => undefined, jitter: false }),
    ).rejects.toMatchObject({ kind: "rate_limit_exceeded", status: 429 });
    expect(calls).toBe(3);
    globalThis.fetch = originalFetch;
  });

  it("does not retry invalid_api_key", async () => {
    let calls = 0;
    globalThis.fetch = vi.fn(async () => {
      calls += 1;
      return openaiJson(401, "invalid_request_error", "invalid_api_key", "Incorrect API key");
    }) as unknown as typeof fetch;
    await expect(
      fetchWithBackoff("https://example.invalid/key", { method: "GET" }, { attempts: 3, sleep: async () => undefined }),
    ).rejects.toMatchObject({ kind: "invalid_api_key", retryable: false });
    expect(calls).toBe(1);
    globalThis.fetch = originalFetch;
  });
});

describe("job resume idempotency", () => {
  it("reuses a failed job and skips an active one", () => {
    expect(resumeJobDecision(null)).toBe("create");
    expect(resumeJobDecision("FAILED")).toBe("reuse");
    expect(resumeJobDecision("ACTIVE")).toBe("skip");
    expect(resumeJobDecision("WAITING")).toBe("skip");
    expect(resumeJobDecision("COMPLETED")).toBe("create");
  });
});

describe("no mock fallback when a key exists", () => {
  it("keeps transcription and analysis on OpenAI", () => {
    process.env.OPENAI_API_KEY = originalKey || "sk-test-not-used";
    expect(resolveAiMode()).toBe("real");
    expect(getTranscriptionProvider().mocked).toBe(false);
    expect(getTranscriptionProvider().providerLabel).toBe("OPENAI");
    expect(getClipAnalysisProvider().mocked).toBe(false);
    if (originalKey) process.env.OPENAI_API_KEY = originalKey;
    else delete process.env.OPENAI_API_KEY;
  });
});
