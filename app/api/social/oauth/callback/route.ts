import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { requireWorkspaceContext } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { getSocialProvider } from "@/lib/social";
import { encryptSecret, safeEqual } from "@/lib/security/crypto";
import type { Prisma } from "@/generated/prisma/client";
import { isSocialPlatform, oauthRedirectUri, usesDevelopmentOAuth, usesOfficialOAuth } from "@/lib/social/oauth";
import { consumeOAuthState } from "@/lib/social/oauth-state";
import { TikTokApiError } from "@/lib/social/tiktok/http";
import { MetaApiError } from "@/lib/social/meta/http";
import { XApiError } from "@/lib/social/x/http";
import { YouTubeApiError } from "@/lib/social/youtube/http";
import { metaOAuth } from "@/lib/social/meta/oauth";
import { createMetaPending } from "@/lib/social/meta/pending";
import { logger } from "@/lib/logger";
import { limitAction } from "@/lib/security/action-limit";
import { accountsConnectedPath, accountsErrorPath, publicOriginFromRequest, publicRedirectFromRequest } from "@/lib/env/app-url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function accountsRedirect(request: Request, error?: string, connected?: string) {
  const path = error ? accountsErrorPath(error) : connected ? accountsConnectedPath(connected) : "/studio/accounts";
  return NextResponse.redirect(publicRedirectFromRequest(path, request));
}

export async function GET(request: Request) {
  const limited = await limitAction("oauth-callback", 40, 60_000);
  if (!limited.ok) {
    return NextResponse.redirect(publicRedirectFromRequest(accountsErrorPath("rate-limit"), request));
  }
  const ctx = await requireWorkspaceContext();
  const url = new URL(request.url);
  const code = url.searchParams.get("code") ?? "";
  const state = url.searchParams.get("state") ?? "";
  const denied = url.searchParams.get("error") ?? "";
  const platformParam = url.searchParams.get("platform") ?? "";
  const cookieStore = await cookies();
  const expectedState = cookieStore.get("cliplab.oauth.state")?.value ?? "";
  const platformCookie = cookieStore.get("cliplab.oauth.platform")?.value ?? "";
  const verifierCookie = cookieStore.get("cliplab.oauth.verifier")?.value ?? "";
  const platform = isSocialPlatform(platformParam)
    ? platformParam
    : isSocialPlatform(platformCookie)
      ? platformCookie
      : null;

  const clear = (response: NextResponse) => {
    response.cookies.delete("cliplab.oauth.state");
    response.cookies.delete("cliplab.oauth.verifier");
    response.cookies.delete("cliplab.oauth.platform");
    return response;
  };

  if (denied) {
    const codeName = denied === "access_denied" ? "oauth-denied" : "oauth";
    return clear(accountsRedirect(request, codeName));
  }

  if (!platform || !code || !expectedState || !state || !safeEqual(state, expectedState)) {
    return clear(accountsRedirect(request, platform === "TIKTOK" ? "tiktok-state" : "oauth-state"));
  }

  let officialVerifier = verifierCookie;
  if (usesOfficialOAuth(platform)) {
    const consumed = await consumeOAuthState({
      state,
      workspaceId: ctx.workspace.id,
      userId: ctx.user.id,
      platform,
    });
    if (!consumed) {
      return clear(accountsRedirect(request, platform === "TIKTOK" ? "tiktok-state" : "oauth-state"));
    }
    officialVerifier = consumed.codeVerifier ?? verifierCookie;
  }

  const provider = getSocialProvider(platform);
  const redirectUri = usesDevelopmentOAuth(platform) ? publicOriginFromRequest(request) : oauthRedirectUri(platform);

  try {
    if (platform === "INSTAGRAM" || platform === "FACEBOOK") {
      const tokens = await metaOAuth.exchangeCode({ code, redirectUri });
      const discovery = await metaOAuth.discoverPages(tokens.accessToken);
      discovery.userExpiresAt = tokens.expiresAt?.toISOString();
      const pendingId = await createMetaPending({
        workspaceId: ctx.workspace.id,
        userId: ctx.user.id,
        intent: platform,
        discovery,
        scopes: tokens.scopes,
      });
      await prisma.auditLog.create({
        data: {
          userId: ctx.user.id,
          workspaceId: ctx.workspace.id,
          action: "META_CONNECTED",
          entityType: "MetaPendingConnect",
          entityId: pendingId,
          metadata: { platform, pages: discovery.pages.length },
        },
      });
      return clear(NextResponse.redirect(publicRedirectFromRequest(`/studio/accounts/meta?pending=${pendingId}`, request)));
    }

    const callback = await provider.handleCallback({ code, redirectUri, codeVerifier: officialVerifier || undefined });
    const existing = await prisma.socialAccount.findUnique({
      where: {
        workspaceId_platform_externalAccountId: {
          workspaceId: ctx.workspace.id,
          platform,
          externalAccountId: callback.profile.externalAccountId,
        },
      },
    });
    await prisma.socialAccount.upsert({
      where: {
        workspaceId_platform_externalAccountId: {
          workspaceId: ctx.workspace.id,
          platform,
          externalAccountId: callback.profile.externalAccountId,
        },
      },
      create: {
        workspaceId: ctx.workspace.id,
        platform,
        externalAccountId: callback.profile.externalAccountId,
        username: callback.profile.username,
        displayName: callback.profile.displayName,
        avatarUrl: callback.profile.avatarUrl,
        accessTokenEncrypted: encryptSecret(callback.accessToken),
        refreshTokenEncrypted: callback.refreshToken ? encryptSecret(callback.refreshToken) : null,
        expiresAt: callback.expiresAt,
        refreshExpiresAt: callback.refreshExpiresAt,
        scopes: callback.scopes,
        status: "CONNECTED",
        lastSyncAt: new Date(),
        mock: provider.mocked,
        providerMeta: (callback.providerMeta as Prisma.InputJsonValue | undefined) ?? undefined,
      },
      update: {
        username: callback.profile.username,
        displayName: callback.profile.displayName,
        avatarUrl: callback.profile.avatarUrl,
        accessTokenEncrypted: encryptSecret(callback.accessToken),
        refreshTokenEncrypted: callback.refreshToken ? encryptSecret(callback.refreshToken) : null,
        expiresAt: callback.expiresAt,
        refreshExpiresAt: callback.refreshExpiresAt,
        scopes: callback.scopes,
        status: "CONNECTED",
        lastSyncAt: new Date(),
        mock: provider.mocked,
        providerMeta: (callback.providerMeta as Prisma.InputJsonValue | undefined) ?? undefined,
      },
    });
    await prisma.auditLog.create({
      data: {
        userId: ctx.user.id,
        workspaceId: ctx.workspace.id,
        action: existing
          ? platform === "TIKTOK"
            ? "TIKTOK_RECONNECTED"
            : platform === "X"
              ? "X_CONNECTED"
              : platform === "YOUTUBE"
                ? "YOUTUBE_CONNECTED"
                : "ACCOUNT_CONNECTED"
          : platform === "TIKTOK"
            ? "TIKTOK_CONNECTED"
            : platform === "X"
              ? "X_CONNECTED"
              : platform === "YOUTUBE"
                ? "YOUTUBE_CONNECTED"
                : "ACCOUNT_CONNECTED",
        entityType: "SocialAccount",
        entityId: callback.profile.externalAccountId,
        metadata: { platform, mock: provider.mocked },
      },
    });
    return clear(accountsRedirect(request, undefined, platform === "TIKTOK" ? "tiktok" : platform.toLowerCase()));
  } catch (error) {
    const codeName =
      error instanceof TikTokApiError || error instanceof MetaApiError || error instanceof XApiError || error instanceof YouTubeApiError
        ? error.code
        : "oauth";
    logger.warn(
      {
        errType: error instanceof Error ? error.name : "Error",
        platform,
        code: codeName,
      },
      "oauth callback failed",
    );
    return clear(accountsRedirect(request, codeName));
  }
}
