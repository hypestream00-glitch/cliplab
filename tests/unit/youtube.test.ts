import { afterEach, describe, expect, it, vi } from "vitest";
import { writeFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createOAuthState, createPkcePair, platformNeedsConfig, usesDevelopmentOAuth } from "@/lib/social/oauth";
import { encryptSecret, decryptSecret } from "@/lib/security/crypto";
import { getSocialProvider } from "@/lib/social";
import { parseYouTubeError, youtubeUserMessage, mapYouTubeVideoStatus } from "@/lib/social/youtube/http";
import { composeYouTubeDescription, composeYouTubeTitle, youtubePublishLockKey } from "@/lib/social/youtube/helpers";
import { startYouTubeResumable, uploadYouTubeChunks, queryYouTubeUploadOffset, YOUTUBE_CHUNK_BYTES } from "@/lib/social/youtube/upload";
import { fetchYouTubeChannel, fetchYouTubeVideoStats } from "@/lib/social/youtube/provider";
import { youtubeAnalyticsStatus, youtubeOAuthStatus, youtubeUploadStatus } from "@/lib/social/youtube/config";
import { PLATFORM_LIMITS } from "@/lib/social/platform-limits";
import { metricOrNA } from "@/lib/social/metric-display";

const GOOGLE_ENV = [
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "YOUTUBE_CLIENT_ID",
  "YOUTUBE_CLIENT_SECRET",
  "AUTH_GOOGLE_ID",
  "AUTH_GOOGLE_SECRET",
  "YOUTUBE_UPLOAD_APPROVED",
  "YOUTUBE_ANALYTICS_APPROVED",
  "YOUTUBE_ANALYTICS_SCOPE",
] as const;

const previousGoogle = Object.fromEntries(GOOGLE_ENV.map((name) => [name, process.env[name]]));

function restoreGoogleEnv() {
  for (const name of GOOGLE_ENV) {
    const previous = previousGoogle[name];
    if (previous == null) delete process.env[name];
    else process.env[name] = previous;
  }
}

function clearGoogleEnv() {
  for (const name of GOOGLE_ENV) delete process.env[name];
}

function withGoogleCreds() {
  process.env.GOOGLE_CLIENT_ID = "google-client";
  process.env.GOOGLE_CLIENT_SECRET = "google-secret";
}

describe("youtube oauth helpers", () => {
  afterEach(() => {
    restoreGoogleEnv();
  });

  it("creates unguessable state", () => {
    expect(createOAuthState()).not.toBe(createOAuthState());
  });

  it("does not treat YouTube as development mock oauth", () => {
    expect(usesDevelopmentOAuth("YOUTUBE")).toBe(false);
  });

  it("reuses Google credentials and reports configuration", () => {
    clearGoogleEnv();
    expect(platformNeedsConfig("YOUTUBE")).toBe(true);
    expect(youtubeOAuthStatus()).toBe("NOT CONFIGURED");
    withGoogleCreds();
    expect(platformNeedsConfig("YOUTUBE")).toBe(false);
    expect(youtubeOAuthStatus()).toBe("CONFIGURED");
    expect(youtubeUploadStatus()).toBe("PERMISSION REQUIRED");
    process.env.YOUTUBE_UPLOAD_APPROVED = "true";
    expect(youtubeUploadStatus()).toBe("AVAILABLE");
    expect(youtubeAnalyticsStatus()).toBe("PERMISSION REQUIRED");
  });
});

describe("youtube token encryption", () => {
  it("roundtrips Google tokens", () => {
    process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || "test-encryption-key-for-cliplab";
    const token = "ya29.example-google-token";
    const packed = encryptSecret(token);
    expect(packed).not.toContain(token);
    expect(decryptSecret(packed)).toBe(token);
  });
});

describe("youtube provider selection", () => {
  afterEach(() => {
    restoreGoogleEnv();
  });

  it("does not fake YouTube oauth when credentials are missing", () => {
    clearGoogleEnv();
    const provider = getSocialProvider("YOUTUBE");
    expect(provider.mocked).toBe(false);
    expect(provider.configured).toBe(false);
    expect(() => provider.getAuthorizationUrl({ state: "s", redirectUri: "https://example.com/cb" })).toThrow(/não está configurado/i);
  });

  it("builds Google authorize URL with offline access and PKCE", () => {
    withGoogleCreds();
    const pkce = createPkcePair();
    const url = getSocialProvider("YOUTUBE").getAuthorizationUrl({
      state: "csrf-state",
      codeChallenge: pkce.challenge,
      redirectUri: "https://example.com/api/social/oauth/callback",
    });
    expect(url).toContain("https://accounts.google.com/o/oauth2/v2/auth");
    expect(url).toContain("access_type=offline");
    expect(url).toContain("prompt=consent");
    expect(url).toContain("youtube.upload");
    expect(url).toContain("code_challenge_method=S256");
    expect(url).not.toContain("yt-analytics.readonly");
  });
});

describe("youtube token and channel (mocked HTTP)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    restoreGoogleEnv();
  });

  it("exchanges code, maps the authorized channel, and stores handle meta", async () => {
    withGoogleCreds();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("oauth2.googleapis.com/token")) {
          return new Response(
            JSON.stringify({
              access_token: "ya29.access",
              refresh_token: "1//refresh",
              expires_in: 3600,
              scope: "https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly",
            }),
            { status: 200 },
          );
        }
        if (url.includes("/channels")) {
          return new Response(
            JSON.stringify({
              items: [
                {
                  id: "UCchannel",
                  snippet: {
                    title: "Studio Channel",
                    customUrl: "@studio",
                    thumbnails: { default: { url: "https://yt/thumb.jpg" } },
                  },
                  statistics: { subscriberCount: "10", viewCount: "200", videoCount: "3" },
                },
              ],
            }),
            { status: 200 },
          );
        }
        return new Response("unexpected", { status: 500 });
      }),
    );
    const result = await getSocialProvider("YOUTUBE").handleCallback({
      code: "auth-code",
      redirectUri: "https://example.com/cb",
      codeVerifier: "pkce-verifier",
    });
    expect(result.accessToken).toBe("ya29.access");
    expect(result.refreshToken).toBe("1//refresh");
    expect(result.profile.externalAccountId).toBe("UCchannel");
    expect(result.profile.username).toBe("studio");
    expect(result.providerMeta?.channelId).toBe("UCchannel");
    expect(result.providerMeta?.handle).toBe("studio");
  });

  it("refreshes Google access tokens", async () => {
    withGoogleCreds();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        expect(String(input)).toContain("oauth2.googleapis.com/token");
        expect(String(init?.body)).toContain("grant_type=refresh_token");
        return new Response(JSON.stringify({ access_token: "ya29.new", expires_in: 3600, scope: "https://www.googleapis.com/auth/youtube.upload" }), {
          status: 200,
        });
      }),
    );
    const refreshed = await getSocialProvider("YOUTUBE").refreshAccessToken("1//old");
    expect(refreshed.accessToken).toBe("ya29.new");
    expect(refreshed.refreshToken).toBe("1//old");
  });

  it("maps mine=true channel payload", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            items: [{ id: "UC1", snippet: { title: "A", customUrl: "@a" }, statistics: { subscriberCount: "5" } }],
          }),
          { status: 200 },
        ),
      ),
    );
    const channel = await fetchYouTubeChannel("tok");
    expect(channel.channelId).toBe("UC1");
    expect(channel.profile.displayName).toBe("A");
  });
});

describe("youtube resumable upload (mocked HTTP)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("initializes resumable upload from Location header", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(null, {
          status: 200,
          headers: { Location: "https://www.googleapis.com/upload/youtube/v3/videos?upload_id=abc" },
        }),
      ),
    );
    const location = await startYouTubeResumable({
      accessToken: "tok",
      videoSize: 1024,
      title: "Clipe",
      description: "desc",
      tags: ["a"],
      privacy: "unlisted",
    });
    expect(location).toContain("upload_id=abc");
  });

  it("uploads chunks, reports progress, and returns videoId", async () => {
    const path = join(tmpdir(), `cliplab-yt-${Date.now()}.bin`);
    await writeFile(path, Buffer.alloc(1024, 7));
    const progress: number[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ id: "vid123" }), { status: 200 })),
    );
    try {
      const id = await uploadYouTubeChunks({
        accessToken: "tok",
        uploadUrl: "https://www.googleapis.com/upload/youtube/v3/videos?upload_id=abc",
        filePath: path,
        videoSize: 1024,
        onProgress: (ratio) => progress.push(ratio),
      });
      expect(id).toBe("vid123");
      expect(progress.at(-1)).toBe(1);
      expect(YOUTUBE_CHUNK_BYTES % (256 * 1024)).toBe(0);
    } finally {
      await unlink(path);
    }
  });

  it("resumes from 308 Range on query", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 308, headers: { Range: "bytes=0-1023" } })),
    );
    await expect(queryYouTubeUploadOffset("tok", "https://upload.example/resumable", 4096)).resolves.toBe(1024);
  });
});

describe("youtube status, quota, metrics, disconnect, idempotency", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    restoreGoogleEnv();
  });

  it("maps video processing to CLIPLAB statuses", () => {
    expect(mapYouTubeVideoStatus({ uploadStatus: "uploaded", processingStatus: "processing" }).status).toBe("PROCESSING");
    expect(mapYouTubeVideoStatus({ uploadStatus: "processed", processingStatus: "succeeded" }).status).toBe("PUBLISHED");
    expect(mapYouTubeVideoStatus({ uploadStatus: "processed" }).status).toBe("PUBLISHED");
    expect(mapYouTubeVideoStatus({ uploadStatus: "failed", failureReason: "codec" }).status).toBe("FAILED");
    expect(mapYouTubeVideoStatus({ processingStatus: "failed" }).status).toBe("FAILED");
  });

  it("treats quotaExceeded as retryable", () => {
    const error = parseYouTubeError(
      { error: { message: "quota", errors: [{ reason: "quotaExceeded", domain: "youtube.quota" }] } },
      403,
    );
    expect(error.code).toBe("quotaExceeded");
    expect(error.retryable).toBe(true);
    expect(youtubeUserMessage("quotaExceeded")).toMatch(/Quota/);
  });

  it("enforces title and description limits", () => {
    expect(composeYouTubeTitle("a".repeat(200)).length).toBeLessThanOrEqual(PLATFORM_LIMITS.YOUTUBE.titleMaxChars);
    expect(composeYouTubeDescription("b".repeat(6000), ["one"]).length).toBeLessThanOrEqual(PLATFORM_LIMITS.YOUTUBE.descriptionMaxChars);
  });

  it("normalizes video stats and leaves shares N/A", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ items: [{ statistics: { viewCount: "10", likeCount: "2", commentCount: "1" } }] }), { status: 200 }),
      ),
    );
    const stats = await fetchYouTubeVideoStats("tok", "vid");
    expect(stats.views).toBe(10);
    expect(stats.available.shares).toBe(false);
    expect(metricOrNA(null, false, "0")).toBe("N/A");
  });

  it("builds a stable publish lock key", () => {
    expect(youtubePublishLockKey("t1", "c1", "a1")).toBe("youtube:t1:c1:a1");
  });

  it("revokes Google token on disconnect", async () => {
    withGoogleCreds();
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      expect(String(input)).toContain("oauth2.googleapis.com/revoke");
      return new Response(null, { status: 200 });
    }));
    await expect(getSocialProvider("YOUTUBE").disconnect({ accessToken: "tok" })).resolves.toBeUndefined();
  });
});
