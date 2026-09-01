import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  externalAiProcessingAllowed,
  socialPublishAllowed,
  envFlag,
} from "@/lib/env/status";
import { resolveAiMode, EXTERNAL_AI_BLOCKED_MESSAGE } from "@/lib/ai/policy";
import { featureFlags } from "@/lib/features/flags";
import { auditProductionUrls } from "@/lib/e2e/production-url-audit";
import {
  redactSmokeText,
  requireLiveSmoke,
  smokeOkLine,
  SMOKE_PASS_LINE,
  SMOKE_CHECKS,
} from "@/lib/e2e/production-smoke";
import { STALE_ACTIVE_MS, toPublicJobStatus, toDbJobStatus } from "@/lib/jobs/status";
import { QUEUE_RETRY } from "@/lib/queue/retry";
import { stripeSecretMode, isStripeLiveKeyBlocked } from "@/lib/billing/stripe-mode";
import { getTranscriptionProvider } from "@/lib/transcription/openai";
import { getClipAnalysisProvider } from "@/lib/services/clip-detection";

describe("production AI / social guards", () => {
  it("defaults AI and social publish off in production and on in test", () => {
    expect(externalAiProcessingAllowed({ NODE_ENV: "production" } as NodeJS.ProcessEnv)).toBe(false);
    expect(socialPublishAllowed({ NODE_ENV: "production" } as NodeJS.ProcessEnv)).toBe(false);
    expect(externalAiProcessingAllowed({ NODE_ENV: "test" } as NodeJS.ProcessEnv)).toBe(true);
    expect(socialPublishAllowed({ NODE_ENV: "development" } as NodeJS.ProcessEnv)).toBe(true);
  });

  it("honors explicit false even in development", () => {
    expect(
      externalAiProcessingAllowed({ NODE_ENV: "development", ALLOW_EXTERNAL_AI_PROCESSING: "false" } as NodeJS.ProcessEnv),
    ).toBe(false);
    expect(socialPublishAllowed({ NODE_ENV: "development", ALLOW_SOCIAL_PUBLISH: "false" } as NodeJS.ProcessEnv)).toBe(
      false,
    );
  });

  it("parses env flags", () => {
    expect(envFlag("ALLOW_SOCIAL_PUBLISH", { ALLOW_SOCIAL_PUBLISH: "true" } as unknown as NodeJS.ProcessEnv)).toBe(true);
    expect(envFlag("ALLOW_SOCIAL_PUBLISH", { ALLOW_SOCIAL_PUBLISH: "0" } as unknown as NodeJS.ProcessEnv)).toBe(false);
    expect(envFlag("ALLOW_SOCIAL_PUBLISH", {} as unknown as NodeJS.ProcessEnv)).toBeUndefined();
  });

  it("OPENAI_REAL requires both a key and the AI guard", () => {
    const prevKey = process.env.OPENAI_API_KEY;
    const prevAllow = process.env.ALLOW_EXTERNAL_AI_PROCESSING;
    try {
      process.env.OPENAI_API_KEY = "sk-test-not-used";
      process.env.ALLOW_EXTERNAL_AI_PROCESSING = "false";
      expect(featureFlags().OPENAI_REAL).toBe(false);
      process.env.ALLOW_EXTERNAL_AI_PROCESSING = "true";
      expect(featureFlags().OPENAI_REAL).toBe(true);
    } finally {
      if (prevKey) process.env.OPENAI_API_KEY = prevKey;
      else delete process.env.OPENAI_API_KEY;
      if (prevAllow === undefined) delete process.env.ALLOW_EXTERNAL_AI_PROCESSING;
      else process.env.ALLOW_EXTERNAL_AI_PROCESSING = prevAllow;
    }
  });

  it("blocked providers throw before any OpenAI HTTP when the guard is off", async () => {
    const prev = process.env.ALLOW_EXTERNAL_AI_PROCESSING;
    const prevKey = process.env.OPENAI_API_KEY;
    try {
      process.env.ALLOW_EXTERNAL_AI_PROCESSING = "false";
      process.env.OPENAI_API_KEY = "sk-test-not-used";
      expect(resolveAiMode()).toBe("mock");
      await expect(getTranscriptionProvider().transcribe({ durationMs: 1000, language: "pt" })).rejects.toThrow(
        EXTERNAL_AI_BLOCKED_MESSAGE,
      );
      await expect(
        getClipAnalysisProvider().analyze({
          language: "pt",
          durationMs: 1000,
          segments: [],
          metadata: { projectId: "smoke", mocked: true },
        }),
      ).rejects.toThrow(EXTERNAL_AI_BLOCKED_MESSAGE);
    } finally {
      if (prev === undefined) delete process.env.ALLOW_EXTERNAL_AI_PROCESSING;
      else process.env.ALLOW_EXTERNAL_AI_PROCESSING = prev;
      if (prevKey) process.env.OPENAI_API_KEY = prevKey;
      else delete process.env.OPENAI_API_KEY;
    }
  });
});

describe("production URL audit", () => {
  it("flags localhost APP_URL and AUTH_URL", () => {
    const issues = auditProductionUrls({
      APP_URL: "http://localhost:3000",
      AUTH_URL: "http://127.0.0.1:3000",
      MEDIA_BASE_URL: "https://cliplab.example",
    } as unknown as NodeJS.ProcessEnv);
    expect(issues.some((issue) => issue.key === "APP_URL")).toBe(true);
    expect(issues.some((issue) => issue.key === "AUTH_URL")).toBe(true);
    expect(issues.some((issue) => issue.key === "MEDIA_BASE_URL")).toBe(false);
  });

  it("accepts public HTTPS APP_URL", () => {
    expect(
      auditProductionUrls({
        APP_URL: "https://cliplab.up.railway.app",
        AUTH_URL: "https://cliplab.up.railway.app",
      } as unknown as NodeJS.ProcessEnv),
    ).toEqual([]);
  });
});

describe("production e2e smoke helpers", () => {
  it("prints the required log lines", () => {
    expect(SMOKE_CHECKS).toEqual([
      "DATABASE",
      "REDIS",
      "R2",
      "QUEUE",
      "WORKER",
      "PROCESSINGJOB",
      "UPLOADSESSION",
    ]);
    expect(smokeOkLine("DATABASE")).toBe("E2E SMOKE: DATABASE OK");
    expect(SMOKE_PASS_LINE).toBe("E2E SMOKE: PASS");
  });

  it("requires live checks only in production or CLIPLAB_PRODUCTION_SMOKE", () => {
    expect(requireLiveSmoke({ NODE_ENV: "test" } as NodeJS.ProcessEnv)).toBe(false);
    expect(requireLiveSmoke({ NODE_ENV: "production" } as NodeJS.ProcessEnv)).toBe(true);
    expect(requireLiveSmoke({ NODE_ENV: "development", CLIPLAB_PRODUCTION_SMOKE: "1" } as NodeJS.ProcessEnv)).toBe(true);
  });

  it("redacts secrets", () => {
    const text = redactSmokeText(
      "fail postgresql://cliplab:secret@localhost:5432/cliplab redis://:pass@host sk_live_abc123",
    );
    expect(text).not.toMatch(/secret|sk_live|postgresql:\/\/cliplab/);
    expect(text).toMatch(/\[redacted\]/);
  });

  it("does not enqueue video-import, OpenAI, Stripe charge, email, or social publish", () => {
    const smoke = readFileSync(path.join(process.cwd(), "lib/e2e/production-smoke.ts"), "utf8");
    const script = readFileSync(path.join(process.cwd(), "scripts/production-e2e-smoke.ts"), "utf8");
    const combined = `${smoke}\n${script}`;
    expect(combined).not.toMatch(/video-import|social-publishing|openai\.com|checkout\.sessions|processEmailOutbox|RENATO/);
    expect(combined).toContain("healthcheck");
    expect(combined).toContain("cliplab/e2e-smoke/");
  });
});

describe("processing job contract", () => {
  it("maps public QUEUED/PROCESSING to WAITING/ACTIVE and recovers stale ACTIVE", () => {
    expect(toDbJobStatus("QUEUED")).toBe("WAITING");
    expect(toDbJobStatus("PROCESSING")).toBe("ACTIVE");
    expect(toPublicJobStatus("WAITING")).toBe("QUEUED");
    expect(toPublicJobStatus("ACTIVE")).toBe("PROCESSING");
    expect(STALE_ACTIVE_MS).toBe(10 * 60_000);
    expect(QUEUE_RETRY.attempts).toBe(3);
    expect(QUEUE_RETRY.backoff.type).toBe("exponential");
  });
});

describe("stripe stays test-only", () => {
  it("treats live keys as blocked", () => {
    const prevSecret = process.env.STRIPE_SECRET_KEY;
    const prevPub = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
    try {
      process.env.STRIPE_SECRET_KEY = "sk_live_blocked";
      process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = "pk_live_blocked";
      expect(stripeSecretMode()).toBe("LIVE");
      expect(isStripeLiveKeyBlocked()).toBe(true);
    } finally {
      if (prevSecret) process.env.STRIPE_SECRET_KEY = prevSecret;
      else delete process.env.STRIPE_SECRET_KEY;
      if (prevPub) process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = prevPub;
      else delete process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
    }
  });
});
