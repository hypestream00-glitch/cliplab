import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  getServerEnv,
  googleOAuthEnvReport,
  hasServerEnv,
  isGoogleOAuthConfigured,
} from "@/lib/env/server";
import { isYouTubeConfigured, youtubeRedirectUri } from "@/lib/social/youtube/config";
import { getSocialProvider } from "@/lib/social";
import { oauthRedirectUri } from "@/lib/social/oauth";
import { evaluateOAuthStateRecord } from "@/lib/social/oauth-state";
import { YOUTUBE_NATIVE_CONNECT_HREF, primaryAccountsConnect, uploadPostGridPlatforms } from "@/lib/social/accounts-connect";
import { PLATFORM_CONNECTION, youtubeNeverUsesUploadPost } from "@/lib/platforms/connection-registry";
import { rememberUploadPostAuthError, resetUploadPostHealthForTests, shouldCallUploadPostRemote } from "@/lib/social/upload-post/health";
import { isTwitchOAuthConfigured, twitchRedirectUri } from "@/lib/social/twitch/config";
import { getSocialProvider as socialProvider } from "@/lib/social";
import { isUnusablePublicHostname, publicOrigin, oauthCallbackUrl } from "@/lib/env/app-url";

describe("google oauth live process env", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    resetUploadPostHealthForTests();
  });

  it("treats GOOGLE_CLIENT_ID present at runtime as configured", () => {
    vi.stubEnv("GOOGLE_CLIENT_ID", "live-id.apps.googleusercontent.com");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "live-secret");
    expect(hasServerEnv("GOOGLE_CLIENT_ID")).toBe(true);
    expect(isGoogleOAuthConfigured()).toBe(true);
    expect(isYouTubeConfigured()).toBe(true);
  });

  it("is false when GOOGLE_CLIENT_ID is absent", () => {
    vi.stubEnv("GOOGLE_CLIENT_ID", "");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "live-secret");
    vi.stubEnv("YOUTUBE_CLIENT_ID", "");
    vi.stubEnv("AUTH_GOOGLE_ID", "");
    expect(hasServerEnv("GOOGLE_CLIENT_ID")).toBe(false);
    expect(isGoogleOAuthConfigured()).toBe(false);
  });

  it("is false when GOOGLE_CLIENT_SECRET is absent", () => {
    vi.stubEnv("GOOGLE_CLIENT_ID", "live-id");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "");
    vi.stubEnv("YOUTUBE_CLIENT_SECRET", "");
    vi.stubEnv("AUTH_GOOGLE_SECRET", "");
    expect(hasServerEnv("GOOGLE_CLIENT_SECRET")).toBe(false);
    expect(isGoogleOAuthConfigured()).toBe(false);
  });

  it("reads env defined after the module is imported", async () => {
    vi.stubEnv("GOOGLE_CLIENT_ID", "");
    expect(getServerEnv("GOOGLE_CLIENT_ID")).toBe("");
    process.env.GOOGLE_CLIENT_ID = "set-after-import";
    expect(getServerEnv("GOOGLE_CLIENT_ID")).toBe("set-after-import");
  });

  it("matches GOOGLE_CLIENT_ID keys with whitespace in the name", () => {
    process.env["GOOGLE_CLIENT_ID "] = "spaced-id";
    process.env.GOOGLE_CLIENT_SECRET = "secret";
    expect(getServerEnv("GOOGLE_CLIENT_ID")).toBe("spaced-id");
    delete process.env["GOOGLE_CLIENT_ID "];
  });

  it("builds accounts.google.com authorize URL with the production callback", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("APP_URL", "https://cortaclip.com");
    vi.stubEnv("AUTH_URL", "https://cortaclip.com");
    vi.stubEnv("GOOGLE_REDIRECT_URI", "");
    vi.stubEnv("YOUTUBE_REDIRECT_URI", "");
    vi.stubEnv("GOOGLE_CLIENT_ID", "google-client");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "google-secret");
    const redirectUri = youtubeRedirectUri();
    expect(redirectUri).toBe("https://cortaclip.com/api/social/oauth/callback");
    expect(oauthRedirectUri("YOUTUBE")).toBe(redirectUri);
    const url = getSocialProvider("YOUTUBE").getAuthorizationUrl({
      state: "csrf-state",
      codeChallenge: "challenge",
      redirectUri,
    });
    const parsed = new URL(url);
    expect(`${parsed.origin}${parsed.pathname}`).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(parsed.searchParams.get("client_id")).toBe("google-client");
    expect(parsed.searchParams.get("redirect_uri")).toBe("https://cortaclip.com/api/social/oauth/callback");
    expect(url).not.toContain("0.0.0.0");
    expect(url).not.toContain("localhost");
    expect(url).not.toContain("google-secret");
  });

  it("never routes YouTube connect through Upload-Post", () => {
    expect(primaryAccountsConnect().href).toBe("/api/social/oauth/start?platform=YOUTUBE");
    expect(YOUTUBE_NATIVE_CONNECT_HREF).toBe("/api/social/oauth/start?platform=YOUTUBE");
    expect(youtubeNeverUsesUploadPost()).toBe(true);
    expect(PLATFORM_CONNECTION.YOUTUBE.connectionProvider).toBe("GOOGLE_NATIVE");
    expect(uploadPostGridPlatforms([])).not.toContain("YOUTUBE");
  });

  it("env-check source returns only boolean/status fields", () => {
    const source = readFileSync(path.resolve("app/api/social/oauth/env-check/route.ts"), "utf8");
    expect(source).toContain("googleClientIdPresent");
    expect(source).toContain("googleClientSecretPresent");
    expect(source).toContain("googleOAuthConfigured");
    expect(source).not.toMatch(/process\.env\.GOOGLE_CLIENT_ID/);
    expect(source).not.toContain("googleClientId:");
    expect(JSON.stringify(googleOAuthEnvReport())).not.toContain("live-secret");
  });

  it("rejects invalid and expired OAuth state and accepts a valid one", () => {
    const params = { workspaceId: "ws1", userId: "u1", platform: "YOUTUBE" as const };
    expect(evaluateOAuthStateRecord(null, params)).toBe("missing");
    expect(
      evaluateOAuthStateRecord({ ...params, usedAt: new Date(), expiresAt: new Date(Date.now() + 60_000) }, params),
    ).toBe("used");
    expect(
      evaluateOAuthStateRecord({ ...params, usedAt: null, expiresAt: new Date(Date.now() - 1000) }, params),
    ).toBe("expired");
    expect(
      evaluateOAuthStateRecord({ ...params, usedAt: null, expiresAt: new Date(Date.now() + 60_000), workspaceId: "other" }, params),
    ).toBe("mismatch");
    expect(
      evaluateOAuthStateRecord({ ...params, usedAt: null, expiresAt: new Date(Date.now() + 60_000) }, params),
    ).toBe("ok");
  });

  it("keeps SocialAccount upsert scoped to workspace + platform + external id", () => {
    const callback = readFileSync(path.resolve("app/api/social/oauth/callback/route.ts"), "utf8");
    expect(callback).toContain("workspaceId_platform_externalAccountId");
    expect(callback).toContain("workspaceId: ctx.workspace.id");
    expect(callback).toContain("externalAccountId: callback.profile.externalAccountId");
  });

  it("isolates Upload-Post 401 from YouTube and Twitch", () => {
    vi.stubEnv("UPLOAD_POST_API_KEY", "up_key");
    vi.stubEnv("GOOGLE_CLIENT_ID", "gid");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "gsecret");
    vi.stubEnv("TWITCH_CLIENT_ID", "tid");
    vi.stubEnv("TWITCH_CLIENT_SECRET", "tsecret");
    rememberUploadPostAuthError();
    expect(shouldCallUploadPostRemote()).toBe(false);
    expect(isYouTubeConfigured()).toBe(true);
    expect(isTwitchOAuthConfigured()).toBe(true);
    expect(primaryAccountsConnect().href).toContain("platform=YOUTUBE");
    const page = readFileSync(path.resolve("app/(studio)/studio/accounts/page.tsx"), "utf8");
    expect(page).toContain("YOUTUBE_NATIVE_CONNECT_HREF");
    expect(page).not.toContain("Não foi possível preparar o perfil de redes sociais");
  });
});

describe("twitch oauth regression", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("builds Twitch authorize URL with public callback and is independent from Google env", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("APP_URL", "https://cortaclip.com");
    vi.stubEnv("GOOGLE_CLIENT_ID", "");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "");
    vi.stubEnv("TWITCH_CLIENT_ID", "twitch-id");
    vi.stubEnv("TWITCH_CLIENT_SECRET", "twitch-secret");
    expect(isTwitchOAuthConfigured()).toBe(true);
    const redirectUri = twitchRedirectUri();
    expect(redirectUri).toBe("https://cortaclip.com/api/social/oauth/callback");
    const url = socialProvider("TWITCH").getAuthorizationUrl({
      state: "twitch-state",
      redirectUri,
    });
    const parsed = new URL(url);
    expect(parsed.hostname).toBe("id.twitch.tv");
    expect(parsed.searchParams.get("redirect_uri")).toBe("https://cortaclip.com/api/social/oauth/callback");
    expect(url).not.toContain("0.0.0.0");
    expect(url).not.toContain("localhost");
    expect(url).not.toContain("twitch-secret");
  });
});

describe("production public origin", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("never treats 0.0.0.0 or localhost as production OAuth hosts", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("APP_URL", "https://cortaclip.com");
    expect(isUnusablePublicHostname("0.0.0.0")).toBe(true);
    expect(isUnusablePublicHostname("localhost")).toBe(true);
    expect(publicOrigin()).toBe("https://cortaclip.com");
    expect(oauthCallbackUrl("YOUTUBE")).toBe("https://cortaclip.com/api/social/oauth/callback");
    expect(oauthCallbackUrl("YOUTUBE")).not.toContain("0.0.0.0");
    expect(oauthCallbackUrl("YOUTUBE")).not.toContain("localhost");
  });
});
