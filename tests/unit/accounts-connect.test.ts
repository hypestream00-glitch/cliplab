import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  NATIVE_OAUTH_PLATFORMS,
  UPLOAD_POST_CONNECT_HREF,
  YOUTUBE_NATIVE_CONNECT_HREF,
  primaryAccountsConnect,
  secondaryAccountsConnect,
  shouldSurfaceUploadPostProfileError,
  uploadPostGridPlatforms,
} from "@/lib/social/accounts-connect";
import { getSocialProvider } from "@/lib/social";
import { oauthRedirectUri } from "@/lib/social/oauth";
import { youtubeRedirectUri } from "@/lib/social/youtube/config";
import { LOG_REDACT_PATHS } from "@/lib/logger";

const ENV_KEYS = [
  "SOCIAL_PROVIDER",
  "UPLOAD_POST_API_KEY",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "YOUTUBE_CLIENT_ID",
  "YOUTUBE_CLIENT_SECRET",
  "AUTH_GOOGLE_ID",
  "AUTH_GOOGLE_SECRET",
  "APP_URL",
  "AUTH_URL",
  "GOOGLE_REDIRECT_URI",
  "YOUTUBE_REDIRECT_URI",
] as const;

describe("studio accounts connect routing", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("uses native YouTube OAuth as the primary CTA even when SOCIAL_PROVIDER is upload-post", () => {
    vi.stubEnv("SOCIAL_PROVIDER", "upload-post");
    vi.stubEnv("UPLOAD_POST_API_KEY", "up_test_key");
    vi.stubEnv("GOOGLE_CLIENT_ID", "google-client");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "google-secret");
    expect(primaryAccountsConnect()).toEqual({
      href: YOUTUBE_NATIVE_CONNECT_HREF,
      provider: "YOUTUBE",
      label: "Conectar conta",
    });
    expect(secondaryAccountsConnect()).toEqual({
      href: UPLOAD_POST_CONNECT_HREF,
      provider: "UPLOAD_POST",
      label: "Outras redes",
    });
    expect(shouldSurfaceUploadPostProfileError()).toBe(false);
  });

  it("falls back to Upload-Post only when Google YouTube OAuth is not configured", () => {
    vi.stubEnv("SOCIAL_PROVIDER", "upload-post");
    vi.stubEnv("UPLOAD_POST_API_KEY", "up_test_key");
    for (const key of [
      "GOOGLE_CLIENT_ID",
      "GOOGLE_CLIENT_SECRET",
      "YOUTUBE_CLIENT_ID",
      "YOUTUBE_CLIENT_SECRET",
      "AUTH_GOOGLE_ID",
      "AUTH_GOOGLE_SECRET",
    ] as const) {
      vi.stubEnv(key, "");
    }
    expect(primaryAccountsConnect()).toEqual({
      href: UPLOAD_POST_CONNECT_HREF,
      provider: "UPLOAD_POST",
      label: "Conectar conta",
    });
    expect(secondaryAccountsConnect()).toBeNull();
    expect(shouldSurfaceUploadPostProfileError()).toBe(true);
  });

  it("keeps Twitch in native platforms and hides Upload-Post YouTube when native Google is ready", () => {
    vi.stubEnv("GOOGLE_CLIENT_ID", "google-client");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "google-secret");
    expect(NATIVE_OAUTH_PLATFORMS).toEqual(["YOUTUBE", "TWITCH", "KICK", "BILIBILI"]);
    expect(uploadPostGridPlatforms([])).not.toContain("YOUTUBE");
    expect(
      uploadPostGridPlatforms([{ platform: "YOUTUBE", provider: "UPLOAD_POST" }]),
    ).toContain("YOUTUBE");
    expect(uploadPostGridPlatforms([{ platform: "TWITCH", provider: "NATIVE" }])).not.toContain("YOUTUBE");
  });

  it("builds Google authorize URL on accounts.google.com with the production callback", () => {
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
    expect(parsed.searchParams.get("redirect_uri")).toBe("https://cortaclip.com/api/social/oauth/callback");
    expect(parsed.searchParams.get("client_secret")).toBeNull();
    expect(url).not.toContain("google-secret");
    expect(url).not.toContain("upload-post");
  });

  it("wires the accounts page and action to native YouTube, not Upload-Post", () => {
    const page = readFileSync(path.resolve("app/(studio)/studio/accounts/page.tsx"), "utf8");
    const actions = readFileSync(path.resolve("app/(studio)/studio/accounts/actions.ts"), "utf8");
    const start = readFileSync(path.resolve("app/api/social/oauth/start/route.ts"), "utf8");
    expect(page).toContain("primaryAccountsConnect");
    expect(page).toContain("NATIVE_OAUTH_PLATFORMS");
    expect(page).toContain("/api/social/oauth/start?platform=${platform}");
    expect(page).not.toContain('href="/api/social/upload-post/connect"');
    expect(NATIVE_OAUTH_PLATFORMS).toContain("TWITCH");
    expect(actions).toContain("primaryAccountsConnect");
    expect(actions).not.toContain('redirect("/api/social/upload-post/connect")');
    expect(start).toContain("authorizeHost");
    expect(start).toContain("accounts.google.com");
    expect(start).not.toContain("authorizationUrl,");
    expect(LOG_REDACT_PATHS).toContain("GOOGLE_CLIENT_SECRET");
    expect(LOG_REDACT_PATHS).toContain("UPLOAD_POST_API_KEY");
    expect(ENV_KEYS.length).toBeGreaterThan(0);
  });
});
