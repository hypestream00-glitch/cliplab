import { afterEach, describe, expect, it, vi } from "vitest";
import { createOAuthState, platformNeedsConfig, usesDevelopmentOAuth } from "@/lib/social/oauth";
import { encryptSecret, decryptSecret } from "@/lib/security/crypto";
import { getSocialProvider } from "@/lib/social";
import { metaOAuth, mapGraphPages } from "@/lib/social/meta/oauth";
import { parseMetaError, metaUserMessage, parseAppUsage } from "@/lib/social/meta/http";
import { mapFacebookVideoStatus, mapInstagramContainerStatus } from "@/lib/social/meta/types";
import { isMetaReachableBase, signMetaMedia, verifyMetaMedia } from "@/lib/social/meta/media-url";
import { composeMetaCaption, metaPublishLockKey, validateFacebookReel, validateInstagramReel } from "@/lib/social/meta/publish-helpers";
import { captionLimitForPlatforms, PLATFORM_LIMITS } from "@/lib/social/platform-limits";
import { instagramProvider, publishInstagramContainer } from "@/lib/social/meta/instagram";
import { facebookProvider } from "@/lib/social/meta/facebook";
import { verifyWebhookSignature } from "@/lib/social/meta/signed-request";
import { metricOrNA } from "@/lib/social/metric-display";
import { createHmac } from "node:crypto";
import { metaInsightsStatus, metaOAuthStatus, metaPublishingStatus } from "@/lib/social/meta/config";

function restoreEnv(name: string, previous: string | undefined) {
  if (previous == null) delete process.env[name];
  else process.env[name] = previous;
}

describe("meta oauth helpers", () => {
  it("creates unguessable states", () => {
    expect(createOAuthState()).not.toBe(createOAuthState());
  });
  it("does not treat Instagram or Facebook as development mock oauth", () => {
    expect(usesDevelopmentOAuth("INSTAGRAM")).toBe(false);
    expect(usesDevelopmentOAuth("FACEBOOK")).toBe(false);
  });
  it("requires app id and secret", () => {
    const previousId = process.env.META_APP_ID;
    const previousSecret = process.env.META_APP_SECRET;
    delete process.env.META_APP_ID;
    delete process.env.META_APP_SECRET;
    expect(platformNeedsConfig("INSTAGRAM")).toBe(true);
    expect(platformNeedsConfig("FACEBOOK")).toBe(true);
    process.env.META_APP_ID = "id";
    process.env.META_APP_SECRET = "secret";
    expect(platformNeedsConfig("INSTAGRAM")).toBe(false);
    restoreEnv("META_APP_ID", previousId);
    restoreEnv("META_APP_SECRET", previousSecret);
  });
});

describe("token encryption", () => {
  it("roundtrips Meta tokens with AES-256-GCM", () => {
    process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || "test-encryption-key-for-cliplab";
    const token = "EAAG-example-page-token";
    const packed = encryptSecret(token);
    expect(packed).not.toContain(token);
    expect(decryptSecret(packed)).toBe(token);
  });
});

describe("page and instagram discovery", () => {
  it("maps Graph pages and linked professional Instagram accounts", () => {
    const pages = mapGraphPages([
      {
        id: "111",
        name: "Studio Page",
        access_token: "PAGE_TOKEN",
        tasks: ["CREATE_CONTENT", "MANAGE"],
        picture: { data: { url: "https://cdn/page.jpg" } },
        instagram_business_account: {
          id: "1784",
          username: "studio",
          name: "Studio IG",
          profile_picture_url: "https://cdn/ig.jpg",
          account_type: "BUSINESS",
        },
      },
      { id: "222", name: "No token", tasks: [] },
    ]);
    expect(pages).toHaveLength(1);
    expect(pages[0]?.id).toBe("111");
    expect(pages[0]?.canCreateContent).toBe(true);
    expect(pages[0]?.instagram?.id).toBe("1784");
    expect(pages[0]?.instagram?.username).toBe("studio");
    expect(pages[0]?.instagram?.accountType).toBe("BUSINESS");
  });
});

describe("container status mapping", () => {
  it("maps official Instagram container statuses", () => {
    expect(mapInstagramContainerStatus("IN_PROGRESS")).toBe("PROCESSING");
    expect(mapInstagramContainerStatus("FINISHED")).toBe("PROCESSING");
    expect(mapInstagramContainerStatus("PUBLISHED")).toBe("PUBLISHED");
    expect(mapInstagramContainerStatus("ERROR")).toBe("FAILED");
    expect(mapInstagramContainerStatus("EXPIRED")).toBe("FAILED");
  });
  it("maps Facebook video status", () => {
    expect(mapFacebookVideoStatus({ publishing_phase: { status: "complete" } }).status).toBe("PUBLISHED");
    expect(mapFacebookVideoStatus({ video_status: "error" }).status).toBe("FAILED");
    expect(mapFacebookVideoStatus({ processing_phase: { status: "in_progress" } }).status).toBe("PROCESSING");
  });
});

describe("errors and rate limit", () => {
  it("marks Graph 429 as retryable", () => {
    const error = parseMetaError({ error: { message: "slow", code: 4 } }, 429);
    expect(error.retryable).toBe(true);
    expect(error.code).toBe("4");
  });
  it("maps expired token and missing permission", () => {
    expect(metaUserMessage("190")).toMatch(/expirado/i);
    expect(metaUserMessage("10")).toMatch(/Permissão/);
    expect(metaUserMessage("localhost_url")).toMatch(/localhost/);
  });
  it("reads X-App-Usage", () => {
    const response = new Response(null, { headers: { "x-app-usage": JSON.stringify({ call_count: 92, total_cputime: 10, total_time: 10 }) } });
    expect(parseAppUsage(response)).toBe(92);
  });
});

describe("provider selection", () => {
  it("does not fake Meta oauth when credentials are missing", () => {
    const previousId = process.env.META_APP_ID;
    const previousSecret = process.env.META_APP_SECRET;
    delete process.env.META_APP_ID;
    delete process.env.META_APP_SECRET;
    const ig = getSocialProvider("INSTAGRAM");
    const fb = getSocialProvider("FACEBOOK");
    expect(ig.mocked).toBe(false);
    expect(fb.mocked).toBe(false);
    expect(ig.configured).toBe(false);
    expect(() => ig.getAuthorizationUrl({ state: "x", redirectUri: "https://example.com/cb" })).toThrow(/não está configurado/i);
    restoreEnv("META_APP_ID", previousId);
    restoreEnv("META_APP_SECRET", previousSecret);
  });
  it("builds the official authorize URL when configured", () => {
    process.env.META_APP_ID = "app_id";
    process.env.META_APP_SECRET = "app_secret";
    const url = getSocialProvider("INSTAGRAM").getAuthorizationUrl({
      state: "csrf-state",
      redirectUri: "https://example.com/api/social/oauth/callback",
    });
    expect(url).toContain("https://www.facebook.com/");
    expect(url).toContain("dialog/oauth");
    expect(url).toContain("client_id=app_id");
    expect(url).toContain("instagram_content_publish");
    expect(url).toContain("pages_manage_posts");
    delete process.env.META_APP_ID;
    delete process.env.META_APP_SECRET;
  });
});

describe("token exchange and lifecycle (mocked HTTP)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.META_APP_ID;
    delete process.env.META_APP_SECRET;
  });

  it("exchanges code, upgrades to long-lived, and discovers pages", async () => {
    process.env.META_APP_ID = "app_id";
    process.env.META_APP_SECRET = "app_secret";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/oauth/access_token") && url.includes("code=")) {
          return new Response(JSON.stringify({ access_token: "short", expires_in: 3600, scope: "pages_show_list,instagram_basic" }), { status: 200 });
        }
        if (url.includes("grant_type=fb_exchange_token")) {
          return new Response(JSON.stringify({ access_token: "long-lived", expires_in: 5184000 }), { status: 200 });
        }
        if (url.includes("/me?fields=id,name") || url.endsWith("/me?fields=id,name")) {
          return new Response(JSON.stringify({ id: "user-1", name: "Ada" }), { status: 200 });
        }
        if (url.includes("/me/accounts")) {
          return new Response(
            JSON.stringify({
              data: [{ id: "page-1", name: "Page", access_token: "page-token", tasks: ["CREATE_CONTENT"] }],
            }),
            { status: 200 },
          );
        }
        return new Response("{}", { status: 404 });
      }),
    );
    const tokens = await metaOAuth.exchangeCode({ code: "auth-code", redirectUri: "https://example.com/cb" });
    expect(tokens.accessToken).toBe("long-lived");
    expect(tokens.profile.externalAccountId).toBe("user-1");
    const discovery = await metaOAuth.discoverPages(tokens.accessToken);
    expect(discovery.pages[0]?.id).toBe("page-1");
    expect(discovery.pages[0]?.pageAccessToken).toBe("page-token");
  });

  it("refreshes long-lived user token", async () => {
    process.env.META_APP_ID = "app_id";
    process.env.META_APP_SECRET = "app_secret";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ access_token: "long-2", expires_in: 5184000 }), { status: 200 })),
    );
    const refreshed = await metaOAuth.refreshLongLivedUserToken("long-1");
    expect(refreshed.accessToken).toBe("long-2");
    expect(refreshed.expiresAt?.getTime()).toBeGreaterThan(Date.now());
  });
});

describe("instagram container and publish (mocked HTTP)", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("creates a Reels container", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ id: "container-1" }), { status: 200 })),
    );
    const init = await instagramProvider.initializeVideoPost!({
      accessToken: "page-token",
      igUserId: "1784",
      videoUrl: "https://cdn.example.com/reel.mp4",
      title: "caption",
      shareToFeed: true,
    });
    expect(init.publishId).toBe("container-1");
  });

  it("publishes a finished container", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ id: "media-9" }), { status: 200 })),
    );
    await expect(publishInstagramContainer("1784", "container-1", "page-token")).resolves.toBe("media-9");
  });

  it("maps container processing status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ status_code: "IN_PROGRESS" }), { status: 200 })),
    );
    const status = await instagramProvider.getPostStatus({ accessToken: "t", publishId: "c1" });
    expect(status.status).toBe("PROCESSING");
  });
});

describe("facebook publish (mocked HTTP)", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("starts and finishes a Page Reel without calling Meta for real", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/video_reels") && String(init?.body ?? "").includes("start")) {
        return new Response(JSON.stringify({ video_id: "vid-1" }), { status: 200 });
      }
      if (url.includes("rupload.facebook.com")) {
        return new Response(JSON.stringify({ success: true }), { status: 200 });
      }
      if (url.includes("/video_reels")) {
        return new Response(JSON.stringify({ success: true }), { status: 200 });
      }
      return new Response("{}", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const result = await facebookProvider.publishVideo({
      accessToken: "page-token",
      pageId: "111",
      videoPath: "package.json",
      videoSize: 12,
      title: "reel",
    });
    expect(result.publishId).toBe("vid-1");
    expect(result.mocked).toBe(false);
  });

  it("maps facebook processing status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ status: { publishing_phase: { status: "complete" } } }), { status: 200 })),
    );
    const status = await facebookProvider.getPostStatus({ accessToken: "t", publishId: "vid-1" });
    expect(status.status).toBe("PUBLISHED");
  });

  it("revokes via DELETE /me/permissions", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await facebookProvider.disconnect({ accessToken: "user-token" });
    expect(JSON.stringify(fetchMock.mock.calls)).toContain("/me/permissions");
  });
});

describe("captions, validation, media URL, idempotency", () => {
  it("uses Instagram caption limit, not TikTok's when only IG is selected", () => {
    expect(captionLimitForPlatforms(["INSTAGRAM"])).toBe(PLATFORM_LIMITS.INSTAGRAM.captionMaxChars);
    expect(captionLimitForPlatforms(["FACEBOOK"])).toBe(PLATFORM_LIMITS.FACEBOOK.captionMaxChars);
    expect(captionLimitForPlatforms(["INSTAGRAM"])).not.toBe(PLATFORM_LIMITS.FACEBOOK.captionMaxChars);
  });
  it("truncates captions per platform", () => {
    const ig = composeMetaCaption("a".repeat(3000), ["one"], "INSTAGRAM");
    expect(ig.length).toBeLessThanOrEqual(PLATFORM_LIMITS.INSTAGRAM.captionMaxChars);
  });
  it("rejects invalid Instagram duration", () => {
    expect(() => validateInstagramReel({ durationMs: 1000, width: 1080, fps: 30, size: 1000 })).toThrow(/3 segundos/);
  });
  it("rejects Facebook reels over 90s", () => {
    expect(() => validateFacebookReel({ durationMs: 120_000, width: 1080, height: 1920, fps: 30, size: 1000 })).toThrow(/90 segundos/);
  });
  it("rejects localhost media URLs", () => {
    expect(isMetaReachableBase("http://localhost:3000")).toBe(false);
    expect(isMetaReachableBase("https://127.0.0.1")).toBe(false);
    expect(isMetaReachableBase("https://cdn.example.com")).toBe(true);
  });
  it("signs and verifies media URLs", () => {
    process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || "test-encryption-key-for-cliplab";
    const exp = Math.floor(Date.now() / 1000) + 60;
    const sig = signMetaMedia("clips/a.mp4", exp);
    expect(verifyMetaMedia("clips/a.mp4", exp, sig)).toBe(true);
    expect(verifyMetaMedia("clips/a.mp4", exp, "deadbeef")).toBe(false);
  });
  it("keeps a stable publish lock key", () => {
    expect(metaPublishLockKey("instagram", "t1", "c1", "a1")).toBe("instagram:t1:c1:a1");
    expect(metaPublishLockKey("facebook", "t1", "c1", "a1")).toBe("facebook:t1:c1:a1");
  });
});

describe("metrics display and diagnostics", () => {
  it("shows N/A when a Meta metric is unavailable", () => {
    expect(metricOrNA(0, false, "0")).toBe("N/A");
    expect(metricOrNA(12, true, "12")).toBe("12");
  });
  it("reports configuration without secrets", () => {
    const previousId = process.env.META_APP_ID;
    const previousSecret = process.env.META_APP_SECRET;
    const previousIg = process.env.META_INSTAGRAM_PUBLISH_APPROVED;
    delete process.env.META_APP_ID;
    delete process.env.META_APP_SECRET;
    delete process.env.META_INSTAGRAM_PUBLISH_APPROVED;
    expect(metaOAuthStatus()).toBe("NOT CONFIGURED");
    expect(metaPublishingStatus("instagram")).toBe("CONFIGURATION REQUIRED");
    expect(metaInsightsStatus()).toBe("PERMISSION REQUIRED");
    process.env.META_APP_ID = "id";
    process.env.META_APP_SECRET = "secret";
    expect(metaOAuthStatus()).toBe("CONFIGURED");
    expect(metaPublishingStatus("instagram")).toBe("APP REVIEW REQUIRED");
    restoreEnv("META_APP_ID", previousId);
    restoreEnv("META_APP_SECRET", previousSecret);
    restoreEnv("META_INSTAGRAM_PUBLISH_APPROVED", previousIg);
  });
});

describe("webhook signature", () => {
  it("rejects unsigned payloads", () => {
    process.env.META_APP_SECRET = "hook-secret";
    expect(verifyWebhookSignature("{}", null)).toBe(false);
    const sig = createHmac("sha256", "hook-secret").update("{}", "utf8").digest("hex");
    expect(verifyWebhookSignature("{}", `sha256=${sig}`)).toBe(true);
    delete process.env.META_APP_SECRET;
  });
});
