import { prisma } from "@/lib/db/prisma";
import { decryptSecret, encryptSecret } from "@/lib/security/crypto";
import { getSocialProvider } from "@/lib/social";
import { TikTokApiError } from "@/lib/social/tiktok/http";
import { MetaApiError } from "@/lib/social/meta/http";
import { XApiError } from "@/lib/social/x/http";
import { YouTubeApiError } from "@/lib/social/youtube/http";
import type { SocialAccount } from "@/generated/prisma/client";
import { logger } from "@/lib/logger";
import { notifyWorkspace } from "@/lib/services/notifications";

const REFRESH_SKEW_MS = 5 * 60 * 1000;
const EXPIRING_MS = 2 * 60 * 60 * 1000;

function missingTokenError(platform: SocialAccount["platform"]) {
  if (platform === "X") return new XApiError("Reconecte a conta X.", "access_token_invalid", 401, false);
  if (platform === "YOUTUBE") return new YouTubeApiError("Reconecte a conta YouTube.", "access_token_invalid", 401, false);
  if (platform === "INSTAGRAM" || platform === "FACEBOOK") {
    return new MetaApiError("Reconecte a conta Meta.", "access_token_invalid", 401, false);
  }
  return new TikTokApiError("Reconecte a conta TikTok.", "access_token_invalid", 401, false);
}

export function accountDisplayStatus(account: Pick<SocialAccount, "status" | "expiresAt" | "refreshExpiresAt">) {
  if (
    account.status === "REAUTH_REQUIRED" ||
    account.status === "ERROR" ||
    account.status === "EXPIRED" ||
    account.status === "CONFIGURATION_REQUIRED"
  ) {
    return account.status;
  }
  if (account.refreshExpiresAt && account.refreshExpiresAt.getTime() < Date.now()) return "EXPIRED";
  if (account.expiresAt && account.expiresAt.getTime() - Date.now() < EXPIRING_MS) return "TOKEN_EXPIRING";
  return account.status;
}

export async function getUsableAccessToken(account: SocialAccount) {
  if (!account.accessTokenEncrypted) {
    await markReauth(account.id, "Token ausente.");
    throw missingTokenError(account.platform);
  }

  if (account.platform === "INSTAGRAM" || account.platform === "FACEBOOK") {
    const stillValid = !account.expiresAt || account.expiresAt.getTime() - Date.now() > REFRESH_SKEW_MS;
    const userFresh = !account.refreshExpiresAt || account.refreshExpiresAt.getTime() - Date.now() > EXPIRING_MS;
    if (stillValid && userFresh) return decryptSecret(account.accessTokenEncrypted);
    if (!account.refreshTokenEncrypted) {
      await markReauth(account.id, "Token de usuário Meta ausente.");
      throw new MetaApiError("Reconecte a conta Meta.", "access_token_invalid", 401, false);
    }
    try {
      return await refreshMetaPageToken(account);
    } catch (error) {
      await markReauth(account.id, error instanceof Error ? error.message : "Refresh Meta falhou.");
      throw error;
    }
  }

  const stillValid = account.expiresAt && account.expiresAt.getTime() - Date.now() > REFRESH_SKEW_MS;
  if (stillValid) return decryptSecret(account.accessTokenEncrypted);

  if (!account.refreshTokenEncrypted) {
    await markReauth(account.id, "Refresh token ausente.");
    throw missingTokenError(account.platform);
  }

  const provider = getSocialProvider(account.platform);
  try {
    const refreshed = await provider.refreshAccessToken(decryptSecret(account.refreshTokenEncrypted));
    await prisma.socialAccount.update({
      where: { id: account.id },
      data: {
        accessTokenEncrypted: encryptSecret(refreshed.accessToken),
        refreshTokenEncrypted: refreshed.refreshToken ? encryptSecret(refreshed.refreshToken) : account.refreshTokenEncrypted,
        expiresAt: refreshed.expiresAt,
        refreshExpiresAt: refreshed.refreshExpiresAt,
        scopes: refreshed.scopes ?? account.scopes,
        status: "CONNECTED",
      },
    });
    return refreshed.accessToken;
  } catch (error) {
    await markReauth(account.id, error instanceof Error ? error.message : "Refresh falhou.");
    throw error;
  }
}

async function markReauth(accountId: string, message: string) {
  logger.warn({ accountId }, "social token requires reauth");
  const account = await prisma.socialAccount.update({
    where: { id: accountId },
    data: { status: "REAUTH_REQUIRED" },
  });
  await notifyWorkspace({
    workspaceId: account.workspaceId,
    type: "ACCOUNT_RECONNECT",
    title: "Conta precisa reconectar",
    body: `@${account.username} (${account.platform}): ${message}`,
    entityType: "SocialAccount",
    entityId: account.id,
  });
}

async function refreshMetaPageToken(account: SocialAccount) {
  const { metaOAuth } = await import("@/lib/social/meta/oauth");
  const { encryptSecret } = await import("@/lib/security/crypto");
  const userToken = decryptSecret(account.refreshTokenEncrypted!);
  const refreshed = await metaOAuth.refreshLongLivedUserToken(userToken);
  const meta = (account.providerMeta ?? {}) as { pageId?: string };
  const pageId = meta.pageId ?? (account.platform === "FACEBOOK" ? account.externalAccountId : undefined);
  if (!pageId) {
    await prisma.socialAccount.update({
      where: { id: account.id },
      data: {
        refreshTokenEncrypted: encryptSecret(refreshed.accessToken),
        refreshExpiresAt: refreshed.expiresAt,
        status: "CONNECTED",
      },
    });
    return decryptSecret(account.accessTokenEncrypted!);
  }
  const page = await metaOAuth.pageAccessToken(refreshed.accessToken, pageId);
  await prisma.socialAccount.update({
    where: { id: account.id },
    data: {
      accessTokenEncrypted: encryptSecret(page.pageAccessToken),
      refreshTokenEncrypted: encryptSecret(refreshed.accessToken),
      expiresAt: null,
      refreshExpiresAt: refreshed.expiresAt,
      status: "CONNECTED",
    },
  });
  return page.pageAccessToken;
}

export async function disconnectSocialAccount(params: {
  workspaceId: string;
  userId: string;
  accountId: string;
}) {
  const account = await prisma.socialAccount.findFirst({
    where: { id: params.accountId, workspaceId: params.workspaceId },
  });
  if (!account) return;
  if (account.provider === "UPLOAD_POST") {
    const { disconnectUploadPostAccount } = await import("@/lib/social/upload-post/accounts");
    await disconnectUploadPostAccount(params);
    return;
  }
  const provider = getSocialProvider(account.platform);
  if ((account.platform === "INSTAGRAM" || account.platform === "FACEBOOK") && account.accessTokenEncrypted) {
    const remaining = await prisma.socialAccount.count({
      where: {
        workspaceId: params.workspaceId,
        platform: { in: ["INSTAGRAM", "FACEBOOK"] },
        mock: false,
        id: { not: account.id },
      },
    });
    if (remaining === 0) {
      const revokeSource = account.refreshTokenEncrypted ?? account.accessTokenEncrypted;
      try {
        await provider.disconnect({ accessToken: decryptSecret(revokeSource!) });
      } catch (error) {
        logger.warn({ err: error }, "meta revoke failed during disconnect");
      }
    }
  } else if (
    !account.mock &&
    (account.platform === "TIKTOK" || account.platform === "X" || account.platform === "YOUTUBE") &&
    account.accessTokenEncrypted
  ) {
    try {
      await provider.disconnect({ accessToken: decryptSecret(account.accessTokenEncrypted) });
    } catch (error) {
      logger.warn({ err: error, platform: account.platform }, "social revoke failed during disconnect");
    }
  }
  await prisma.liveChannel.updateMany({
    where: { socialAccountId: account.id },
    data: { socialAccountId: null },
  });
  await prisma.socialAccount.delete({ where: { id: account.id } });
  await prisma.auditLog.create({
    data: {
      userId: params.userId,
      workspaceId: params.workspaceId,
      action:
        account.platform === "TIKTOK"
          ? "TIKTOK_DISCONNECTED"
          : account.platform === "INSTAGRAM" || account.platform === "FACEBOOK"
            ? "META_DISCONNECTED"
            : account.platform === "X"
              ? "X_DISCONNECTED"
              : account.platform === "YOUTUBE"
                ? "YOUTUBE_DISCONNECTED"
                : "ACCOUNT_DISCONNECTED",
      entityType: "SocialAccount",
      entityId: account.id,
      metadata: { platform: account.platform },
    },
  });
}
