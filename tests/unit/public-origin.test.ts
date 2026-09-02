import { afterEach, describe, expect, it, vi } from "vitest";
import {
  accountsConnectedPath,
  accountsErrorPath,
  isUnusablePublicHostname,
  oauthCallbackUrl,
  originFromCandidate,
  publicAppUrl,
  publicOrigin,
  publicRedirectUrl,
  resolvePublicOrigin,
} from "@/lib/env/app-url";

describe("public origin for browser redirects", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("uses APP_URL in production and ignores Railway bind host 0.0.0.0:8080", () => {
    const origin = resolvePublicOrigin({
      env: {
        NODE_ENV: "production",
        APP_URL: "https://cortaclip.com",
        AUTH_URL: "https://cortaclip.com",
      } as NodeJS.ProcessEnv,
      requestUrl: "https://0.0.0.0:8080/api/social/upload-post/connect",
      headers: { host: "0.0.0.0:8080", "x-forwarded-host": "0.0.0.0:8080" },
    });
    expect(origin).toBe("https://cortaclip.com");
    expect(
      publicRedirectUrl("/studio/accounts?error=invalid-connect-url", {
        env: { NODE_ENV: "production", APP_URL: "https://cortaclip.com" } as NodeJS.ProcessEnv,
        requestUrl: "https://0.0.0.0:8080/studio/accounts",
      }).href,
    ).toBe("https://cortaclip.com/studio/accounts?error=invalid-connect-url");
  });

  it("falls back to AUTH_URL then NEXTAUTH_URL when APP_URL is an internal bind", () => {
    expect(
      resolvePublicOrigin({
        env: {
          NODE_ENV: "production",
          APP_URL: "http://0.0.0.0:8080",
          AUTH_URL: "https://cortaclip.com",
        } as NodeJS.ProcessEnv,
      }),
    ).toBe("https://cortaclip.com");
    expect(
      resolvePublicOrigin({
        env: {
          NODE_ENV: "production",
          NEXTAUTH_URL: "https://cortaclip.com",
        } as NodeJS.ProcessEnv,
      }),
    ).toBe("https://cortaclip.com");
  });

  it("uses localhost only in development when public env is unset", () => {
    expect(
      resolvePublicOrigin({
        env: { NODE_ENV: "development" } as NodeJS.ProcessEnv,
        requestUrl: "http://localhost:3000/studio/accounts",
      }),
    ).toBe("http://localhost:3000");
  });

  it("does not treat 0.0.0.0 as a public origin", () => {
    expect(isUnusablePublicHostname("0.0.0.0")).toBe(true);
    expect(originFromCandidate("https://0.0.0.0:8080", { NODE_ENV: "production" } as NodeJS.ProcessEnv)).toBeNull();
    expect(originFromCandidate("http://localhost:3000", { NODE_ENV: "production" } as NodeJS.ProcessEnv)).toBeNull();
  });

  it("uses x-forwarded public host only when env is missing", () => {
    expect(
      resolvePublicOrigin({
        env: { NODE_ENV: "production" } as NodeJS.ProcessEnv,
        requestUrl: "https://0.0.0.0:8080/api/social/oauth/start",
        headers: {
          host: "0.0.0.0:8080",
          "x-forwarded-host": "cortaclip.com",
          "x-forwarded-proto": "https",
        },
      }),
    ).toBe("https://cortaclip.com");
  });

  it("falls back to cortaclip.com in production when every candidate is internal", () => {
    expect(
      resolvePublicOrigin({
        env: { NODE_ENV: "production" } as NodeJS.ProcessEnv,
        requestUrl: "https://0.0.0.0:8080/",
        headers: { host: "0.0.0.0:8080" },
      }),
    ).toBe("https://cortaclip.com");
  });
});

describe("YouTube oauth callback and accounts redirects", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("builds the Google redirect_uri from APP_URL, not the Railway bind", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("APP_URL", "https://cortaclip.com");
    vi.stubEnv("AUTH_URL", "https://cortaclip.com");
    vi.stubEnv("GOOGLE_REDIRECT_URI", "");
    vi.stubEnv("YOUTUBE_REDIRECT_URI", "");
    expect(oauthCallbackUrl("YOUTUBE")).toBe("https://cortaclip.com/api/social/oauth/callback");
    expect(publicOrigin()).toBe("https://cortaclip.com");
  });

  it("builds error and success account URLs on the public origin", () => {
    const input = {
      env: { NODE_ENV: "production", APP_URL: "https://cortaclip.com" } as NodeJS.ProcessEnv,
      requestUrl: "https://0.0.0.0:8080/api/social/oauth/callback",
    };
    expect(publicAppUrl(accountsErrorPath("invalid-connect-url"), input)).toBe(
      "https://cortaclip.com/studio/accounts?error=invalid-connect-url",
    );
    expect(publicAppUrl(accountsConnectedPath("youtube"), input)).toBe(
      "https://cortaclip.com/studio/accounts?connected=youtube",
    );
    expect(publicAppUrl("/studio/accounts", input)).toBe("https://cortaclip.com/studio/accounts");
  });
});
