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
import { limitAction } from "@/lib/security/action-limit";
import { cookieSecure } from "@/lib/security/cookies";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const limited = await limitAction("oauth-start", 20, 60_000);
  if (!limited.ok) {
    return NextResponse.redirect(new URL("/studio/accounts?error=rate-limit", request.url));
  }
  const ctx = await requireWorkspaceContext();
  const url = new URL(request.url);
  const platform = url.searchParams.get("platform") ?? "";
  if (!isSocialPlatform(platform)) {
    return NextResponse.redirect(new URL("/studio/accounts", request.url));
  }

  if (platform === "TIKTOK" && platformNeedsConfig("TIKTOK")) {
    return NextResponse.redirect(new URL("/studio/accounts?error=tiktok-config", request.url));
  }
  if ((platform === "INSTAGRAM" || platform === "FACEBOOK") && platformNeedsConfig(platform)) {
    return NextResponse.redirect(new URL("/studio/accounts?error=meta-config", request.url));
  }
  if (platform === "X" && platformNeedsConfig("X")) {
    return NextResponse.redirect(new URL("/studio/accounts?error=x-config", request.url));
  }
  if (platform === "YOUTUBE" && platformNeedsConfig("YOUTUBE")) {
    return NextResponse.redirect(new URL("/studio/accounts?error=youtube-config", request.url));
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
      redirectUri: usesDevelopmentOAuth(platform) ? new URL(request.url).origin : redirectUri,
    });
  } catch (error) {
    const message =
      error instanceof TikTokApiError || error instanceof MetaApiError || error instanceof XApiError || error instanceof YouTubeApiError
        ? error.code
        : "oauth";
    return NextResponse.redirect(new URL(`/studio/accounts?error=${encodeURIComponent(message)}`, request.url));
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
