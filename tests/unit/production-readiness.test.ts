import { describe, expect, it } from "vitest";
import { validateProcessEnv, essentialEnvErrors } from "@/lib/env/schema";
import { featureFlags } from "@/lib/features/flags";
import { featureState, getFeatureAvailability } from "@/lib/features/availability";
import { oauthCallbackUrl, oauthCallbackCatalog, mediaUrlIsSafeForExternalApis, publicBaseUrl } from "@/lib/env/app-url";
import { rateLimit, resetRateLimitForTests } from "@/lib/security/rate-limit";
import { livenessBody, readinessBody } from "@/lib/health/payload";
import { LOG_REDACT_PATHS } from "@/lib/logger";
import { isPrismaUniqueViolation, stripeCreditReference, analysisCreditKey } from "@/lib/webhooks/idempotency";
import { corsOriginFor } from "@/lib/security/cors";
import { envTruthy } from "@/lib/env/status";
import { looksLikeVideoContainer } from "@/lib/media/validate";

describe("env validation", () => {
  it("requires DATABASE_URL as essential and allows missing TikTok/Stripe", () => {
    const result = validateProcessEnv({
      DATABASE_URL: "postgresql://cliplab:cliplab@localhost:5432/cliplab",
      TIKTOK_REDIRECT_URI: "not-a-url",
    } as unknown as NodeJS.ProcessEnv);
    expect(result.issues.some((issue) => issue.key === "DATABASE_URL" && issue.essential)).toBe(false);
    expect(result.issues.some((issue) => issue.key === "TIKTOK_REDIRECT_URI" && !issue.essential)).toBe(true);
    expect(essentialEnvErrors({} as unknown as NodeJS.ProcessEnv).some((issue) => issue.key === "DATABASE_URL")).toBe(true);
  });

  it("treats falsey approval flags as not approved", () => {
    process.env.TIKTOK_CONTENT_POSTING_APPROVED = "false";
    expect(envTruthy("TIKTOK_CONTENT_POSTING_APPROVED")).toBe(false);
    delete process.env.TIKTOK_CONTENT_POSTING_APPROVED;
  });
});

describe("feature availability", () => {
    it("maps missing openai to CONFIGURATION REQUIRED and missing stripe to CONFIGURATION REQUIRED", () => {
    const prevOpen = process.env.OPENAI_API_KEY;
    const prevStripe = process.env.STRIPE_SECRET_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.STRIPE_SECRET_KEY;
    const status = getFeatureAvailability();
    expect(status.openai).toBe("CONFIG_REQUIRED");
    expect(featureState(status.openai)).toBe("CONFIGURATION REQUIRED");
    expect(status.stripe).toBe("CONFIG_REQUIRED");
    expect(featureState(status.stripe)).toBe("CONFIGURATION REQUIRED");
    expect(featureFlags().OPENAI_REAL).toBe(false);
    expect(featureFlags().STRIPE_BILLING).toBe(false);
    if (prevOpen) process.env.OPENAI_API_KEY = prevOpen;
    if (prevStripe) process.env.STRIPE_SECRET_KEY = prevStripe;
  });
});

describe("callbacks", () => {
  it("builds a single callback catalog from AUTH_URL", () => {
    const prev = process.env.AUTH_URL;
    const prevSocial = process.env.SOCIAL_PROVIDER;
    process.env.AUTH_URL = "https://app.example.com";
    process.env.SOCIAL_PROVIDER = "upload-post";
    delete process.env.MEDIA_BASE_URL;
    delete process.env.TIKTOK_REDIRECT_URI;
    delete process.env.META_REDIRECT_URI;
    delete process.env.X_REDIRECT_URI;
    delete process.env.GOOGLE_REDIRECT_URI;
    expect(oauthCallbackUrl("TIKTOK")).toBe("https://app.example.com/api/social/oauth/callback");
    expect(oauthCallbackCatalog().map((item) => item.id)).toEqual(["upload-post"]);
    expect(publicBaseUrl()).toBe("https://app.example.com");
    process.env.AUTH_URL = prev;
    if (prevSocial) process.env.SOCIAL_PROVIDER = prevSocial;
    else delete process.env.SOCIAL_PROVIDER;
  });

  it("rejects localhost media URLs for external APIs", () => {
    expect(mediaUrlIsSafeForExternalApis("http://localhost:3000")).toBe(false);
    expect(mediaUrlIsSafeForExternalApis("file:///tmp/a.mp4")).toBe(false);
    expect(mediaUrlIsSafeForExternalApis("https://cdn.example.com")).toBe(true);
  });
});

describe("rate limiting", () => {
  it("blocks after the window limit", () => {
    resetRateLimitForTests();
    expect(rateLimit({ key: "login:test", limit: 2, windowMs: 60_000 }).ok).toBe(true);
    expect(rateLimit({ key: "login:test", limit: 2, windowMs: 60_000 }).ok).toBe(true);
    const blocked = rateLimit({ key: "login:test", limit: 2, windowMs: 60_000 });
    expect(blocked.ok).toBe(false);
  });
});

describe("health and ready helpers", () => {
  it("reports liveness without secrets", () => {
    expect(livenessBody()).toEqual({ ok: true, service: "cliplab" });
  });

  it("is not ready when queue is unavailable", () => {
    const body = readinessBody({ database: "ok", queue: "unavailable", essential: [] });
    expect(body.ready).toBe(false);
    expect(JSON.stringify(body)).not.toMatch(/SECRET|PASSWORD|postgresql:\/\//i);
  });
});

describe("secret redaction", () => {
  it("redacts auth, cookie, password, secret, token and apiKey paths", () => {
    const joined = LOG_REDACT_PATHS.join(" ").toLowerCase();
    for (const item of ["authorization", "cookie", "password", "secret", "token", "apikey", "encryption_key", "signedurl"]) {
      expect(joined).toContain(item);
    }
  });
});

describe("webhook and credit idempotency", () => {
  it("detects prisma unique violations and stable keys", () => {
    expect(isPrismaUniqueViolation({ code: "P2002" })).toBe(true);
    expect(isPrismaUniqueViolation({ code: "P2003" })).toBe(false);
    expect(stripeCreditReference("evt_1")).toBe("stripe:evt_1");
    expect(analysisCreditKey("proj_1")).toBe("project:proj_1:analysis");
  });
});

describe("cors", () => {
  it("does not echo unknown origins", () => {
    expect(corsOriginFor("https://evil.example")).toBeNull();
    expect(corsOriginFor("http://localhost:3000")).toBe("http://localhost:3000");
  });
});

describe("upload magic", () => {
  it("accepts mp4 ftyp headers", () => {
    const header = Buffer.from("\0\0\0\x18ftypisom");
    expect(looksLikeVideoContainer(header)).toBe(true);
    expect(looksLikeVideoContainer(Buffer.from("hello world!!!!"))).toBe(false);
  });
});
