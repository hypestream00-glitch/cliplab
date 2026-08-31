import { afterEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { createOAuthState, createPkcePair, platformNeedsConfig, usesDevelopmentOAuth } from "@/lib/social/oauth";
import { encryptSecret, decryptSecret } from "@/lib/security/crypto";
import { getSocialProvider } from "@/lib/social";
import { parseXError, parseXRateLimit, xUserMessage } from "@/lib/social/x/http";
import { mapXMediaStatus, composeXCaption, xPublishLockKey, xCaptionMaxChars } from "@/lib/social/x/helpers";
import { planXMediaChunks } from "@/lib/social/x/upload";
import { xOAuthStatus, xPublishingStatus } from "@/lib/social/x/config";
import { createXPost, fetchXTweetMetrics } from "@/lib/social/x/provider";
import { PLATFORM_LIMITS, xCaptionLimit } from "@/lib/social/platform-limits";
import { metricOrNA } from "@/lib/social/metric-display";

function restoreEnv(name: string, previous: string | undefined) {
  if (previous == null) delete process.env[name];
  else process.env[name] = previous;
}

function restoreXEnv() {
  restoreEnv("X_CLIENT_ID", previousX.X_CLIENT_ID);
  restoreEnv("X_CLIENT_SECRET", previousX.X_CLIENT_SECRET);
  restoreEnv("X_API_TIER", previousX.X_API_TIER);
  restoreEnv("X_WRITE_ACCESS_APPROVED", previousX.X_WRITE_ACCESS_APPROVED);
  restoreEnv("X_LONG_POSTS", previousX.X_LONG_POSTS);
}

const previousX = {
  X_CLIENT_ID: process.env.X_CLIENT_ID,
  X_CLIENT_SECRET: process.env.X_CLIENT_SECRET,
  X_API_TIER: process.env.X_API_TIER,
  X_WRITE_ACCESS_APPROVED: process.env.X_WRITE_ACCESS_APPROVED,
  X_LONG_POSTS: process.env.X_LONG_POSTS,
};

function withXCreds() {
  process.env.X_CLIENT_ID = "x-client";
  process.env.X_CLIENT_SECRET = "x-secret";
}

describe("x oauth helpers", () => {
  afterEach(() => {
    restoreXEnv();
  });

  it("creates unguessable states and PKCE S256", () => {
    expect(createOAuthState()).not.toBe(createOAuthState());
    const pkce = createPkcePair();
    expect(pkce.verifier.length).toBeGreaterThan(20);
    expect(pkce.challenge).toBe(createHash("sha256").update(pkce.verifier).digest("base64url"));
  });

  it("does not treat X as development mock oauth", () => {
    expect(usesDevelopmentOAuth("X")).toBe(false);
  });

  it("requires client id and secret", () => {
    delete process.env.X_CLIENT_ID;
    delete process.env.X_CLIENT_SECRET;
    expect(platformNeedsConfig("X")).toBe(true);
    expect(xOAuthStatus()).toBe("NOT CONFIGURED");
    withXCreds();
    expect(platformNeedsConfig("X")).toBe(false);
    expect(xOAuthStatus()).toBe("CONFIGURED");
  });

  it("distinguishes publishing access by tier", () => {
    withXCreds();
    delete process.env.X_API_TIER;
    delete process.env.X_WRITE_ACCESS_APPROVED;
    expect(xPublishingStatus()).toBe("API ACCESS REQUIRED");
    process.env.X_API_TIER = "free";
    expect(xPublishingStatus()).toBe("PLAN REQUIRED");
    process.env.X_API_TIER = "basic";
    expect(xPublishingStatus()).toBe("AVAILABLE");
    process.env.X_API_TIER = "free";
    process.env.X_WRITE_ACCESS_APPROVED = "true";
    expect(xPublishingStatus()).toBe("AVAILABLE");
  });
});

describe("x token encryption", () => {
  it("roundtrips access tokens", () => {
    process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || "test-encryption-key-for-cliplab";
    const token = "x-access-token-example";
    const packed = encryptSecret(token);
    expect(packed).not.toContain(token);
    expect(decryptSecret(packed)).toBe(token);
  });
});

describe("x provider selection", () => {
  afterEach(() => {
    restoreXEnv();
  });

  it("does not fake X oauth when credentials are missing", () => {
    delete process.env.X_CLIENT_ID;
    delete process.env.X_CLIENT_SECRET;
    const provider = getSocialProvider("X");
    expect(provider.mocked).toBe(false);
    expect(provider.configured).toBe(false);
    expect(() => provider.getAuthorizationUrl({ state: "s", redirectUri: "https://example.com/cb" })).toThrow(/não está configurado/i);
  });

  it("builds the official authorize URL with PKCE", () => {
    withXCreds();
    const pkce = createPkcePair();
    const url = getSocialProvider("X").getAuthorizationUrl({
      state: "csrf-state",
      codeChallenge: pkce.challenge,
      redirectUri: "https://example.com/api/social/oauth/callback",
    });
    expect(url).toContain("https://x.com/i/oauth2/authorize");
    expect(url).toContain("client_id=x-client");
    expect(url).toContain("code_challenge_method=S256");
    expect(url).toContain("code_challenge=");
    expect(url).toContain("tweet.write");
    expect(url).toContain("media.write");
    expect(url).toContain("offline.access");
    expect(() =>
      getSocialProvider("X").getAuthorizationUrl({ state: "s", redirectUri: "https://example.com/cb" }),
    ).toThrow(/PKCE/);
  });
});

describe("x token exchange and refresh (mocked HTTP)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    restoreXEnv();
  });

  it("exchanges code with PKCE verifier and loads profile", async () => {
    withXCreds();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/oauth2/token")) {
          return new Response(
            JSON.stringify({
              access_token: "x-access",
              refresh_token: "x-refresh",
              expires_in: 7200,
              scope: "tweet.read tweet.write users.read offline.access media.write",
              token_type: "bearer",
            }),
            { status: 200 },
          );
        }
        if (url.includes("/users/me")) {
          return new Response(
            JSON.stringify({
              data: { id: "2244994945", name: "CLIPLAB", username: "cliplab", profile_image_url: "https://pbs.twimg.com/a.jpg" },
            }),
            { status: 200 },
          );
        }
        return new Response("unexpected", { status: 500 });
      }),
    );
    const result = await getSocialProvider("X").handleCallback({
      code: "auth-code",
      redirectUri: "https://example.com/cb",
      codeVerifier: "verifier-from-pkce",
    });
    expect(result.accessToken).toBe("x-access");
    expect(result.refreshToken).toBe("x-refresh");
    expect(result.profile.externalAccountId).toBe("2244994945");
    expect(result.profile.username).toBe("cliplab");
    expect(result.scopes).toContain("media.write");
  });

  it("requires PKCE verifier on callback", async () => {
    withXCreds();
    await expect(
      getSocialProvider("X").handleCallback({ code: "c", redirectUri: "https://example.com/cb" }),
    ).rejects.toThrow(/code_verifier/i);
  });

  it("refreshes and rotates the refresh token", async () => {
    withXCreds();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes("/oauth2/token")) {
          const body = String(init?.body ?? "");
          expect(body).toContain("grant_type=refresh_token");
          expect(body).toContain("refresh_token=old-refresh");
          return new Response(
            JSON.stringify({
              access_token: "x-access-2",
              refresh_token: "x-refresh-rotated",
              expires_in: 7200,
              scope: "tweet.write media.write users.read tweet.read offline.access",
            }),
            { status: 200 },
          );
        }
        if (url.includes("/users/me")) {
          return new Response(JSON.stringify({ data: { id: "1", name: "A", username: "a" } }), { status: 200 });
        }
        return new Response("unexpected", { status: 500 });
      }),
    );
    const refreshed = await getSocialProvider("X").refreshAccessToken("old-refresh");
    expect(refreshed.accessToken).toBe("x-access-2");
    expect(refreshed.refreshToken).toBe("x-refresh-rotated");
  });

  it("loads profile from users/me", async () => {
    withXCreds();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ data: { id: "99", name: "Studio", username: "studio" } }), { status: 200 })),
    );
    const profile = await getSocialProvider("X").getProfile("token");
    expect(profile.externalAccountId).toBe("99");
    expect(profile.username).toBe("studio");
  });
});

describe("x media upload and publish (mocked HTTP)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    restoreXEnv();
  });

  it("plans chunked video upload under 5MB segments", () => {
    expect(planXMediaChunks(1_000_000)).toEqual({ chunkSize: 4 * 1024 * 1024, totalChunkCount: 1 });
    const plan = planXMediaChunks(10 * 1024 * 1024);
    expect(plan.chunkSize).toBe(4 * 1024 * 1024);
    expect(plan.totalChunkCount).toBe(3);
  });

  it("initializes media upload via INIT", async () => {
    withXCreds();
    process.env.X_API_TIER = "basic";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ data: { id: "media-1", media_id_string: "media-1" } }), { status: 200 })),
    );
    const init = await getSocialProvider("X").initializeVideoPost?.({
      accessToken: "tok",
      videoSize: 8_000_000,
    });
    expect(init?.publishId).toBe("media-1");
    expect(init?.chunkSize).toBe(4 * 1024 * 1024);
  });

  it("creates a post only after media id is ready", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        expect(String(input)).toContain("/2/tweets");
        const body = JSON.parse(String(init?.body));
        expect(body.media.media_ids).toEqual(["media-9"]);
        return new Response(JSON.stringify({ data: { id: "tweet-1" } }), { status: 200 });
      }),
    );
    await expect(createXPost("tok", "hello", "media-9")).resolves.toBe("tweet-1");
  });

  it("maps media processing states", () => {
    expect(mapXMediaStatus("pending")).toBe("PROCESSING");
    expect(mapXMediaStatus("in_progress")).toBe("PROCESSING");
    expect(mapXMediaStatus("succeeded")).toBe("PUBLISHED");
    expect(mapXMediaStatus("failed")).toBe("FAILED");
  });

  it("refuses publish when the API tier cannot write", async () => {
    withXCreds();
    process.env.X_API_TIER = "free";
    await expect(
      getSocialProvider("X").publishVideo({ accessToken: "t", videoPath: "/tmp/a.mp4", videoSize: 10 }),
    ).rejects.toThrow(/indisponível|plano|acesso/i);
  });
});

describe("x rate limits, errors, caption, metrics, idempotency", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    restoreXEnv();
  });
  it("marks 429 as retryable and reads rate-limit headers", () => {
    const error = parseXError({ error: "rate_limit_exceeded", error_description: "slow" }, 429);
    expect(error.retryable).toBe(true);
    expect(error.code).toBe("rate_limit_exceeded");
    const headers = new Headers({ "x-rate-limit-remaining": "0", "x-rate-limit-limit": "300", "x-rate-limit-reset": "1700000000" });
    const parsed = parseXRateLimit(new Response(null, { headers }));
    expect(parsed.remaining).toBe(0);
    expect(parsed.limit).toBe(300);
  });

  it("maps plan restriction from 403", () => {
    const error = parseXError({ title: "Client Forbidden", detail: "Your client is not enrolled / upgrade your access level" }, 403);
    expect(error.code).toBe("plan_restriction");
    expect(xUserMessage("plan_restriction")).toMatch(/Basic/);
  });

  it("does not exceed the current caption limit", () => {
    const previous = process.env.X_LONG_POSTS;
    delete process.env.X_LONG_POSTS;
    const caption = composeXCaption("a".repeat(400), ["one", "two"], xCaptionMaxChars());
    expect(caption.length).toBeLessThanOrEqual(PLATFORM_LIMITS.X.captionMaxChars);
    expect(xCaptionLimit()).toBe(280);
    process.env.X_LONG_POSTS = "true";
    expect(xCaptionLimit()).toBe(25_000);
    restoreEnv("X_LONG_POSTS", previous);
  });

  it("normalizes tweet metrics and leaves impressions N/A when absent", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({ data: { public_metrics: { like_count: 3, reply_count: 1, retweet_count: 2 } } }),
          { status: 200 },
        ),
      ),
    );
    const metrics = await fetchXTweetMetrics("tok", "1");
    expect(metrics.likes).toBe(3);
    expect(metrics.available.views).toBe(false);
    expect(metricOrNA(metrics.views, metrics.available.views, "0")).toBe("N/A");
    vi.unstubAllGlobals();
  });

  it("builds a stable publish lock key", () => {
    expect(xPublishLockKey("t1", "c1", "a1")).toBe("x:t1:c1:a1");
  });

  it("revokes on disconnect without throwing when HTTP succeeds", async () => {
    process.env.X_CLIENT_ID = "x-client";
    process.env.X_CLIENT_SECRET = "x-secret";
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 200 })));
    await expect(getSocialProvider("X").disconnect({ accessToken: "tok" })).resolves.toBeUndefined();
  });
});
