import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  googleClientIdPresent,
  googleClientSecretPresent,
  googleOAuthEnvPresence,
  googleOAuthIdFromProcessEnv,
  googleOAuthSecretFromProcessEnv,
  readLiveEnv,
} from "@/lib/env/request-env";
import { isYouTubeConfigured, youtubeClientId, youtubeRedirectUri } from "@/lib/social/youtube/config";
import { getSocialProvider } from "@/lib/social";
import { oauthRedirectUri } from "@/lib/social/oauth";

describe("google oauth live process env", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("reads GOOGLE_CLIENT_ID from the live process env bag, including trimmed key names", () => {
    vi.stubEnv("GOOGLE_CLIENT_ID", " live-id ");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", " live-secret ");
    expect(readLiveEnv("GOOGLE_CLIENT_ID")).toBe("live-id");
    expect(readLiveEnv("GOOGLE_CLIENT_SECRET")).toBe("live-secret");
    expect(googleOAuthIdFromProcessEnv()).toBe("live-id");
    expect(googleOAuthSecretFromProcessEnv()).toBe("live-secret");
    expect(googleClientIdPresent()).toBe(true);
    expect(googleClientSecretPresent()).toBe(true);
    expect(googleOAuthEnvPresence()).toEqual({
      googleClientIdPresent: true,
      googleClientSecretPresent: true,
    });
    expect(isYouTubeConfigured()).toBe(true);
    expect(youtubeClientId()).toBe("live-id");
  });

  it("falls back to AUTH_GOOGLE_* only when GOOGLE_CLIENT_* is absent", () => {
    vi.stubEnv("GOOGLE_CLIENT_ID", "");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "");
    vi.stubEnv("AUTH_GOOGLE_ID", "auth-id");
    vi.stubEnv("AUTH_GOOGLE_SECRET", "auth-secret");
    expect(googleClientIdPresent()).toBe(false);
    expect(googleClientSecretPresent()).toBe(false);
    expect(googleOAuthIdFromProcessEnv()).toBe("auth-id");
    expect(googleOAuthSecretFromProcessEnv()).toBe("auth-secret");
    expect(isYouTubeConfigured()).toBe(true);
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
    expect(parsed.searchParams.get("client_secret")).toBeNull();
    expect(url).not.toContain("google-secret");
  });

  it("env-check route returns only presence booleans", () => {
    const source = readFileSync(path.resolve("app/api/social/oauth/env-check/route.ts"), "utf8");
    expect(source).toContain("googleClientIdPresent");
    expect(source).toContain("googleClientSecretPresent");
    expect(source).toContain('export const runtime = "nodejs"');
    expect(source).toContain('export const dynamic = "force-dynamic"');
    expect(source).not.toMatch(/process\.env\.GOOGLE_CLIENT_ID/);
    expect(source).not.toContain("googleClientId:");
    expect(source).not.toContain("googleClientSecret:");
  });
});
