import { NextResponse } from "next/server";
import { requireWorkspaceContext } from "@/lib/auth/session";
import { getSocialProvider } from "@/lib/social";
import {
  createOAuthState,
  createPkcePair,
  isSocialPlatform,
  oauthRedirectUri,
  platformNeedsConfig,
  usesDevelopmentOAuth,
  usesOfficialOAuth,
} from "@/lib/social/oauth";
import { issueOAuthState } from "@/lib/social/oauth-state";
import { TikTokApiError } from "@/lib/social/tiktok/http";
import { MetaApiError } from "@/lib/social/meta/http";
import { XApiError } from "@/lib/social/x/http";
import { YouTubeApiError } from "@/lib/social/youtube/http";
import { SocialApiError } from "@/lib/social/errors";
import { limitAction } from "@/lib/security/action-limit";
import { cookieSecure } from "@/lib/security/cookies";
import { accountsErrorPath, publicOriginFromRequest, publicRedirectFromRequest } from "@/lib/env/app-url";
import { logger } from "@/lib/logger";
import {
  googleOAuthIdFromProcessEnv,
  googleOAuthSecretFromProcessEnv,
  logGoogleOAuthEnvPresence,
  readLiveEnv,
} from "@/lib/env/request-env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

function accountsRedirect(request: Request, path: string) {
  return NextResponse.redirect(publicRedirectFromRequest(path, request));
}

export async function GET(request: Request) {
  const limited = await limitAction("oauth-start", 20, 60_000);
  if (!limited.ok) {
    return accountsRedirect(request, accountsErrorPath("rate-limit"));
  }
  const ctx = await requireWorkspaceContext();
  const url = new URL(request.url);
  const platform = url.searchParams.get("platform") ?? "";
  if (!isSocialPlatform(platform)) {
    return accountsRedirect(request, "/studio/accounts");
  }

  if (platform === "TIKTOK" && platformNeedsConfig("TIKTOK")) {
    return accountsRedirect(request, accountsErrorPath("tiktok-config"));
  }
  if ((platform === "INSTAGRAM" || platform === "FACEBOOK") && platformNeedsConfig(platform)) {
    return accountsRedirect(request, accountsErrorPath("meta-config"));
  }
  if (platform === "X" && platformNeedsConfig("X")) {
    return accountsRedirect(request, accountsErrorPath("x-config"));
  }
  if (platform === "YOUTUBE") {
    const googleClientId = googleOAuthIdFromProcessEnv();
    const googleClientSecret = googleOAuthSecretFromProcessEnv();
    const GOOGLE_CLIENT_ID_PRESENT = readLiveEnv("GOOGLE_CLIENT_ID").length > 0;
    const GOOGLE_CLIENT_SECRET_PRESENT = readLiveEnv("GOOGLE_CLIENT_SECRET").length > 0;
    logGoogleOAuthEnvPresence();
    logger.info({ GOOGLE_CLIENT_ID_PRESENT, GOOGLE_CLIENT_SECRET_PRESENT }, "youtube oauth env");
    if (!googleClientId || !googleClientSecret) {
      return accountsRedirect(request, accountsErrorPath("youtube-config"));
    }
  }
  if (platform === "TWITCH" && platformNeedsConfig("TWITCH")) {
    return accountsRedirect(request, accountsErrorPath("twitch-config"));
  }
  if (platform === "KICK" && platformNeedsConfig("KICK")) {
    return accountsRedirect(request, accountsErrorPath("kick-config"));
  }
  if (platform === "BILIBILI" && platformNeedsConfig("BILIBILI")) {
    return accountsRedirect(request, accountsErrorPath("bilibili-config"));
  }

  const redirectUri = oauthRedirectUri(platform);
  const issued = usesOfficialOAuth(platform)
    ? await issueOAuthState({
        workspaceId: ctx.workspace.id,
        userId: ctx.user.id,
        platform,
        redirectUri,
      })
    : (() => {
        const pkce = createPkcePair();
        return { state: createOAuthState(), verifier: pkce.verifier, challenge: pkce.challenge };
      })();

  const provider = getSocialProvider(platform);
  let authorizationUrl: string;
  try {
    authorizationUrl = provider.getAuthorizationUrl({
      state: issued.state,
      codeChallenge: issued.challenge,
      redirectUri: usesDevelopmentOAuth(platform) ? publicOriginFromRequest(request) : redirectUri,
    });
    let authorizeHost = "";
    try {
      authorizeHost = new URL(authorizationUrl).hostname;
    } catch {
      logger.warn({ platform }, "oauth start produced an invalid authorization url");
      return accountsRedirect(request, accountsErrorPath("oauth"));
    }
    if (platform === "YOUTUBE" && authorizeHost !== "accounts.google.com") {
      logger.warn({ platform, authorizeHost }, "youtube oauth host unexpected");
      return accountsRedirect(request, accountsErrorPath("oauth"));
    }
    logger.info({ platform, authorizeHost, redirectUri }, "oauth start redirect");
  } catch (error) {
    const message =
      error instanceof TikTokApiError ||
      error instanceof MetaApiError ||
      error instanceof XApiError ||
      error instanceof YouTubeApiError ||
      error instanceof SocialApiError
        ? error.code
        : "oauth";
    logger.warn({ errType: error instanceof Error ? error.name : "Error", platform, code: message }, "oauth start failed");
    return accountsRedirect(request, accountsErrorPath(message));
  }

  const response = NextResponse.redirect(authorizationUrl);
  response.cookies.set("cliplab.oauth.state", issued.state, {
    httpOnly: true,
    sameSite: "lax",
    secure: cookieSecure(),
    path: "/",
    maxAge: 600,
  });
  response.cookies.set("cliplab.oauth.verifier", issued.verifier, {
    httpOnly: true,
    sameSite: "lax",
    secure: cookieSecure(),
    path: "/",
    maxAge: 600,
  });
  response.cookies.set("cliplab.oauth.platform", platform, {
    httpOnly: true,
    sameSite: "lax",
    secure: cookieSecure(),
    path: "/",
    maxAge: 600,
  });
  return response;
}
