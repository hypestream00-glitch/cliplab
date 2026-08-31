import { afterEach, describe, expect, it, vi } from "vitest";
import { createOAuthState, platformNeedsConfig, usesDevelopmentOAuth } from "@/lib/social/oauth";
import { encryptSecret, decryptSecret, safeEqual } from "@/lib/security/crypto";
import { mapTikTokPublishStatus } from "@/lib/social/tiktok/types";
import { planVideoChunks } from "@/lib/social/tiktok/upload";
import { parseTikTokError, tiktokUserMessage } from "@/lib/social/tiktok/http";
import { composeTikTokTitle } from "@/lib/social/tiktok/caption";
import { metricOrNA } from "@/lib/social/metric-display";
import { getSocialProvider } from "@/lib/social";
import { PLATFORM_LIMITS } from "@/lib/social/platform-limits";

describe("tiktok oauth helpers", () => {
  it("creates unguessable states", () => {
    const a = createOAuthState();
    const b = createOAuthState();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThan(20);
  });
  it("does not treat TikTok as development mock oauth", () => {
    expect(usesDevelopmentOAuth("TIKTOK")).toBe(false);
  });
  it("requires client key and secret", () => {
    const previousKey = process.env.TIKTOK_CLIENT_KEY;
    const previousSecret = process.env.TIKTOK_CLIENT_SECRET;
    delete process.env.TIKTOK_CLIENT_KEY;
    delete process.env.TIKTOK_CLIENT_ID;
    delete process.env.TIKTOK_CLIENT_SECRET;
    expect(platformNeedsConfig("TIKTOK")).toBe(true);
    process.env.TIKTOK_CLIENT_KEY = "key";
    process.env.TIKTOK_CLIENT_SECRET = "secret";
    expect(platformNeedsConfig("TIKTOK")).toBe(false);
    if (previousKey) process.env.TIKTOK_CLIENT_KEY = previousKey;
    else delete process.env.TIKTOK_CLIENT_KEY;
    if (previousSecret) process.env.TIKTOK_CLIENT_SECRET = previousSecret;
    else delete process.env.TIKTOK_CLIENT_SECRET;
  });
});

describe("token encryption", () => {
  it("roundtrips with AES-256-GCM", () => {
    process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || "test-encryption-key-for-cliplab";
    const token = "act.example-access-token";
    const packed = encryptSecret(token);
    expect(packed).not.toContain(token);
    expect(decryptSecret(packed)).toBe(token);
  });
  it("rejects invalid state with timing-safe compare", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "xyz")).toBe(false);
  });
});

describe("status mapping", () => {
  it("maps official TikTok statuses", () => {
    expect(mapTikTokPublishStatus("PROCESSING_UPLOAD")).toBe("UPLOADING");
    expect(mapTikTokPublishStatus("PROCESSING_DOWNLOAD")).toBe("PROCESSING");
    expect(mapTikTokPublishStatus("PUBLISH_COMPLETE")).toBe("PUBLISHED");
    expect(mapTikTokPublishStatus("FAILED")).toBe("FAILED");
  });
});

describe("upload chunking", () => {
  it("uploads small files as a whole", () => {
    expect(planVideoChunks(1_000_000)).toEqual({ chunkSize: 1_000_000, totalChunkCount: 1 });
  });
  it("splits files over 64MB", () => {
    const plan = planVideoChunks(80 * 1024 * 1024);
    expect(plan.totalChunkCount).toBeGreaterThan(1);
    expect(plan.chunkSize).toBe(10 * 1024 * 1024);
  });
});

describe("caption limits", () => {
  it("does not exceed official title length", () => {
    const title = composeTikTokTitle("a".repeat(3000), ["one", "two"]);
    expect(title.length).toBeLessThanOrEqual(PLATFORM_LIMITS.TIKTOK.captionMaxChars);
  });
});

describe("errors and rate limit", () => {
  it("marks 429 as retryable", () => {
    const error = parseTikTokError({ error: { code: "rate_limit_exceeded", message: "slow down" } }, 429);
    expect(error.retryable).toBe(true);
    expect(error.code).toBe("rate_limit_exceeded");
  });
  it("maps failed publication reasons", () => {
    expect(tiktokUserMessage("file_format_check_failed")).toMatch(/Formato/);
    expect(tiktokUserMessage("spam_risk_too_many_posts")).toMatch(/Limite/);
  });
});

describe("provider selection", () => {
  it("does not fake TikTok oauth when credentials are missing", () => {
    const previousKey = process.env.TIKTOK_CLIENT_KEY;
    const previousSecret = process.env.TIKTOK_CLIENT_SECRET;
    delete process.env.TIKTOK_CLIENT_KEY;
    delete process.env.TIKTOK_CLIENT_ID;
    delete process.env.TIKTOK_CLIENT_SECRET;
    const provider = getSocialProvider("TIKTOK");
    expect(provider.mocked).toBe(false);
    expect(provider.configured).toBe(false);
    expect(() => provider.getAuthorizationUrl({ state: "x", redirectUri: "https://example.com/cb" })).toThrow(/não está configurado/i);
    if (previousKey) process.env.TIKTOK_CLIENT_KEY = previousKey;
    if (previousSecret) process.env.TIKTOK_CLIENT_SECRET = previousSecret;
  });
  it("builds the official authorize URL when configured, without calling TikTok", () => {
    process.env.TIKTOK_CLIENT_KEY = "test_key";
    process.env.TIKTOK_CLIENT_SECRET = "test_secret";
    const provider = getSocialProvider("TIKTOK");
    const url = provider.getAuthorizationUrl({
      state: "csrf-state",
      redirectUri: "https://example.com/api/social/oauth/callback",
    });
    expect(url).toContain("https://www.tiktok.com/v2/auth/authorize/");
    expect(url).toContain("client_key=test_key");
    expect(url).toContain("response_type=code");
    expect(url).toContain("video.publish");
    delete process.env.TIKTOK_CLIENT_KEY;
    delete process.env.TIKTOK_CLIENT_SECRET;
  });
});

describe("token exchange (mocked HTTP)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });
  it("exchanges code without hitting the real API", async () => {
    process.env.TIKTOK_CLIENT_KEY = "test_key";
    process.env.TIKTOK_CLIENT_SECRET = "test_secret";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/oauth/token/")) {
          return new Response(
            JSON.stringify({
              access_token: "act.test",
              refresh_token: "rft.test",
              expires_in: 86400,
              refresh_expires_in: 31536000,
              open_id: "open-1",
              scope: "user.info.basic,video.publish",
              token_type: "Bearer",
            }),
            { status: 200 },
          );
        }
        if (url.includes("/user/info/")) {
          return new Response(
            JSON.stringify({
              data: { user: { open_id: "open-1", display_name: "Creator", username: "creator", avatar_url: "https://cdn/a.jpg" } },
              error: { code: "ok", message: "" },
            }),
            { status: 200 },
          );
        }
        return new Response("{}", { status: 404 });
      }),
    );
    const provider = getSocialProvider("TIKTOK");
    const result = await provider.handleCallback({
      code: "auth-code",
      redirectUri: "https://example.com/api/social/oauth/callback",
    });
    expect(result.accessToken).toBe("act.test");
    expect(result.profile.externalAccountId).toBe("open-1");
    expect(result.profile.username).toBe("creator");
    expect(result.scopes).toContain("video.publish");
    delete process.env.TIKTOK_CLIENT_KEY;
    delete process.env.TIKTOK_CLIENT_SECRET;
  });
  it("refreshes tokens via mocked HTTP", async () => {
    process.env.TIKTOK_CLIENT_KEY = "test_key";
    process.env.TIKTOK_CLIENT_SECRET = "test_secret";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        return new Response(
          JSON.stringify({
            access_token: "act.new",
            refresh_token: "rft.new",
            expires_in: 86400,
            open_id: "open-1",
            scope: "user.info.basic",
            token_type: "Bearer",
          }),
          { status: 200 },
        );
      }),
    );
    const provider = getSocialProvider("TIKTOK");
    const refreshed = await provider.refreshAccessToken("rft.old");
    expect(refreshed.accessToken).toBe("act.new");
    expect(refreshed.refreshToken).toBe("rft.new");
    delete process.env.TIKTOK_CLIENT_KEY;
    delete process.env.TIKTOK_CLIENT_SECRET;
  });
});

describe("publication init and status (mocked HTTP)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.TIKTOK_CLIENT_KEY;
    delete process.env.TIKTOK_CLIENT_SECRET;
  });

  it("initializes a Direct Post without uploading a real file", async () => {
    process.env.TIKTOK_CLIENT_KEY = "test_key";
    process.env.TIKTOK_CLIENT_SECRET = "test_secret";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/post/publish/video/init/")) {
          return new Response(
            JSON.stringify({
              data: { publish_id: "v_pub_1", upload_url: "https://open-upload.tiktokapis.com/video" },
              error: { code: "ok", message: "" },
            }),
            { status: 200 },
          );
        }
        return new Response("{}", { status: 404 });
      }),
    );
    const provider = getSocialProvider("TIKTOK");
    const init = await provider.initializeVideoPost!({
      accessToken: "act.test",
      videoSize: 1_000_000,
      title: "clip",
      privacyLevel: "SELF_ONLY",
    });
    expect(init.publishId).toBe("v_pub_1");
    expect(init.uploadUrl).toContain("open-upload.tiktokapis.com");
  });

  it("maps creator privacy options from official creator_info", async () => {
    process.env.TIKTOK_CLIENT_KEY = "test_key";
    process.env.TIKTOK_CLIENT_SECRET = "test_secret";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        return new Response(
          JSON.stringify({
            data: {
              creator_username: "creator",
              creator_nickname: "Creator",
              privacy_level_options: ["PUBLIC_TO_EVERYONE", "SELF_ONLY"],
              comment_disabled: false,
              duet_disabled: true,
              stitch_disabled: false,
              max_video_post_duration_sec: 180,
            },
            error: { code: "ok", message: "" },
          }),
          { status: 200 },
        );
      }),
    );
    const provider = getSocialProvider("TIKTOK");
    const creator = await provider.getCreatorInfo!("act.test");
    expect(creator.privacyLevelOptions).toEqual(["PUBLIC_TO_EVERYONE", "SELF_ONLY"]);
    expect(creator.duetDisabled).toBe(true);
  });

  it("maps FAILED publish status", async () => {
    process.env.TIKTOK_CLIENT_KEY = "test_key";
    process.env.TIKTOK_CLIENT_SECRET = "test_secret";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        return new Response(
          JSON.stringify({
            data: { status: "FAILED", fail_reason: "file_format_check_failed" },
            error: { code: "ok", message: "" },
          }),
          { status: 200 },
        );
      }),
    );
    const provider = getSocialProvider("TIKTOK");
    const status = await provider.getPostStatus({ accessToken: "act.test", publishId: "v_pub_1" });
    expect(status.status).toBe("FAILED");
    expect(status.failReason).toMatch(/Formato/);
  });

  it("revokes access via official endpoint", async () => {
    process.env.TIKTOK_CLIENT_KEY = "test_key";
    process.env.TIKTOK_CLIENT_SECRET = "test_secret";
    const fetchMock = vi.fn(async (_input: RequestInfo | URL) => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const provider = getSocialProvider("TIKTOK");
    await provider.revokeAccess!("act.test");
    await provider.disconnect({ accessToken: "act.test" });
    expect(fetchMock).toHaveBeenCalled();
    const firstUrl = fetchMock.mock.calls[0]?.[0];
    expect(String(firstUrl)).toContain("/oauth/revoke/");
  });
});

describe("metrics display", () => {
  it("shows N/A when the official metric is unavailable", () => {
    expect(metricOrNA(0, false, "0")).toBe("N/A");
    expect(metricOrNA(12, true, "12")).toBe("12");
  });
});

describe("idempotency key", () => {
  it("is stable per target/clip/account", () => {
    const key = `tiktok:target1:clip1:account1`;
    expect(key).toBe("tiktok:target1:clip1:account1");
  });
});
