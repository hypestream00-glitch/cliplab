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
import { isYouTubeConfigured, youtubeClientId, youtubeRedirectUri } from "@/lib/social/youtube/config";
import { LOG_REDACT_PATHS } from "@/lib/logger";
import { firstRuntimeEnv, runtimeEnv } from "@/lib/env/runtime";
import { accountsErrorPath } from "@/lib/env/app-url";
import { assertUploadPostAccessUrl } from "@/lib/social/upload-post/connect";

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

  it("does not send + Conectar conta to Upload-Post when Google env looks empty (invalid-connect-url reproduction)", () => {
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
    expect(primaryAccountsConnect().href).toBe("/api/social/oauth/start?platform=YOUTUBE");
    expect(primaryAccountsConnect().href).not.toBe("/api/social/upload-post/connect");
    expect(accountsErrorPath("invalid-connect-url")).toBe("/studio/accounts?error=invalid-connect-url");
    expect(shouldSurfaceUploadPostProfileError()).toBe(false);
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
    expect(parsed.hostname).not.toBe("0.0.0.0");
    expect(parsed.hostname).not.toBe("localhost");
  });

  it("rejects Google authorize URLs in Upload-Post connect validation (source of invalid-connect-url)", () => {
    const googleUrl =
      "https://accounts.google.com/o/oauth2/v2/auth?client_id=abc&redirect_uri=https%3A%2F%2Fcortaclip.com%2Fapi%2Fsocial%2Foauth%2Fcallback";
    expect(() => assertUploadPostAccessUrl(googleUrl)).toThrow(/inválida/);
    expect(() => assertUploadPostAccessUrl("https://app.upload-post.com/connect")).toThrow(/token/);
  });

  it("reads Google OAuth client id at request time via live process env keys", () => {
    vi.stubEnv("GOOGLE_CLIENT_ID", " runtime-google-id ");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "runtime-secret");
    expect(runtimeEnv("GOOGLE_CLIENT_ID")).toBe("runtime-google-id");
    expect(firstRuntimeEnv(["GOOGLE_CLIENT_ID", "YOUTUBE_CLIENT_ID"])).toBe("runtime-google-id");
    expect(youtubeClientId()).toBe("runtime-google-id");
    expect(isYouTubeConfigured()).toBe(true);
    const youtubeConfig = readFileSync(path.resolve("lib/social/youtube/config.ts"), "utf8");
    const runtime = readFileSync(path.resolve("lib/env/runtime.ts"), "utf8");
    const serverEnv = readFileSync(path.resolve("lib/env/server.ts"), "utf8");
    expect(youtubeConfig).not.toMatch(/process\.env\.GOOGLE_CLIENT_ID/);
    expect(youtubeConfig).not.toMatch(/process\.env\.GOOGLE_CLIENT_SECRET/);
    expect(youtubeConfig).toContain("googleOAuthClientId");
    expect(runtime).not.toContain('from "node:process"');
    expect(runtime).toContain("getServerEnv");
    expect(serverEnv).toContain("new Function");
    expect(serverEnv).not.toMatch(/process\.env\.GOOGLE_CLIENT_ID/);
    expect(readFileSync(path.resolve("lib/env/proc-environ.ts"), "utf8")).toContain("/proc/self/environ");
  });

  it("wires the accounts page CTA to native YouTube, not Upload-Post", () => {
    const page = readFileSync(path.resolve("app/(studio)/studio/accounts/page.tsx"), "utf8");
    const actions = readFileSync(path.resolve("app/(studio)/studio/accounts/actions.ts"), "utf8");
    const start = readFileSync(path.resolve("app/api/social/oauth/start/route.ts"), "utf8");
    const connect = readFileSync(path.resolve("app/api/social/upload-post/connect/route.ts"), "utf8");
    const envCheck = readFileSync(path.resolve("app/api/social/oauth/env-check/route.ts"), "utf8");
    expect(page).toContain("YOUTUBE_NATIVE_CONNECT_HREF");
    expect(page).toContain("<a href={YOUTUBE_NATIVE_CONNECT_HREF}>+ Conectar conta</a>");
    expect(page).not.toContain("primaryConnect.href");
    expect(page).not.toContain('href="/api/social/upload-post/connect"');
    expect(page).not.toContain("YouTubeConfigNotice");
    expect(page).not.toContain('platformNeedsConfig("YOUTUBE")');
    expect(connect).toContain('accountsError(request, "invalid-connect-url")');
    expect(start).not.toContain("invalid-connect-url");
    expect(YOUTUBE_NATIVE_CONNECT_HREF).toBe("/api/social/oauth/start?platform=YOUTUBE");
    expect(NATIVE_OAUTH_PLATFORMS).toContain("TWITCH");
    expect(actions).toContain("primaryAccountsConnect");
    expect(actions).not.toContain('redirect("/api/social/upload-post/connect")');
    expect(start).toContain("logGoogleOAuthEnvPresence");
    expect(start).toContain("googleClientIdPresent");
    expect(start).toContain("googleClientSecretPresent");
    expect(start).toContain("isGoogleOAuthConfigured");
    expect(start).toContain("google-oauth-not-configured");
    expect(start).not.toContain("isYouTubeConfigured");
    expect(start).not.toMatch(/process\.env\.GOOGLE_CLIENT_ID/);
    expect(start).not.toMatch(/env\.GOOGLE_CLIENT_ID/);
    expect(page).toContain('export const dynamic = "force-dynamic"');
    expect(page).toContain("await connection()");
    expect(envCheck).toContain("googleClientIdPresent");
    expect(envCheck).toContain("googleClientSecretPresent");
    expect(envCheck).not.toContain("GOOGLE_CLIENT_ID_PRESENT=");
    expect(LOG_REDACT_PATHS).toContain("GOOGLE_CLIENT_SECRET");
    expect(LOG_REDACT_PATHS).toContain("UPLOAD_POST_API_KEY");
  });
});
