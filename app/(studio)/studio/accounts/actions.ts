"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireWorkspaceContext } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { getSocialProvider } from "@/lib/social";
import { encryptSecret, randomToken } from "@/lib/security/crypto";
import type { SocialPlatform } from "@/generated/prisma/client";
import { disconnectSocialAccount } from "@/lib/services/social-accounts";
import { syncTikTokAccountMetrics } from "@/lib/services/tiktok-analytics";
import { syncInstagramAccountMetrics, syncFacebookAccountMetrics } from "@/lib/services/meta-analytics";
import { syncXAccountMetrics } from "@/lib/services/x-analytics";
import { syncYouTubeAccountMetrics } from "@/lib/services/youtube-analytics";
import { isUploadPostPrimary } from "@/lib/social/router";
import { isUploadPostConfigured } from "@/lib/social/upload-post/config";
import { syncUploadPostAccounts } from "@/lib/social/upload-post/accounts";
import { syncUploadPostAnalytics } from "@/lib/social/upload-post/analytics";
import { primaryAccountsConnect } from "@/lib/social/accounts-connect";
import { noteUploadPostError, shouldCallUploadPostRemote } from "@/lib/social/upload-post/health";

const PLATFORMS = new Set<SocialPlatform>([
  "TIKTOK",
  "INSTAGRAM",
  "FACEBOOK",
  "X",
  "LINKEDIN",
  "BLUESKY",
  "YOUTUBE",
  "THREADS",
  "PINTEREST",
  "TWITCH",
  "KICK",
  "REDDIT",
]);

export async function connectSocialNetworksAction() {
  redirect(primaryAccountsConnect().href);
}

export async function refreshSocialAccountsAction() {
  const ctx = await requireWorkspaceContext();
  if (isUploadPostPrimary() && isUploadPostConfigured() && shouldCallUploadPostRemote()) {
    try {
      await syncUploadPostAccounts(ctx.workspace.id);
      await syncUploadPostAnalytics(ctx.workspace.id).catch(() => undefined);
    } catch (error) {
      noteUploadPostError(error);
    }
  }
  revalidatePath("/studio/accounts");
  revalidatePath("/studio/metrics/accounts");
  redirect("/studio/accounts?connected=1");
}

export async function connectSocialAction(formData: FormData) {
  const platform = String(formData.get("platform") ?? "") as SocialPlatform;
  if (isUploadPostPrimary()) {
    redirect("/studio/accounts");
  }
  if (platform === "TIKTOK" || platform === "INSTAGRAM" || platform === "FACEBOOK" || platform === "X" || platform === "YOUTUBE") {
    redirect(`/api/social/oauth/start?platform=${platform}`);
  }
  const ctx = await requireWorkspaceContext();
  if (!PLATFORMS.has(platform)) {
    redirect("/studio/accounts");
  }

  const provider = getSocialProvider(platform);
  const callback = await provider.handleCallback({
    code: `dev_${platform}`,
    redirectUri: "http://localhost:3000/studio/accounts",
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
      scopes: callback.scopes,
      status: "CONNECTED",
      lastSyncAt: new Date(),
      mock: provider.mocked,
    },
    update: {
      username: callback.profile.username,
      displayName: callback.profile.displayName,
      accessTokenEncrypted: encryptSecret(callback.accessToken),
      refreshTokenEncrypted: callback.refreshToken ? encryptSecret(callback.refreshToken) : null,
      expiresAt: callback.expiresAt,
      status: "CONNECTED",
      lastSyncAt: new Date(),
      mock: provider.mocked,
    },
  });

  await prisma.auditLog.create({
    data: {
      userId: ctx.user.id,
      workspaceId: ctx.workspace.id,
      action: "ACCOUNT_CONNECTED",
      entityType: "SocialAccount",
      entityId: callback.profile.externalAccountId,
      metadata: { platform, mock: provider.mocked, state: randomToken(8) },
    },
  });

  revalidatePath("/studio/accounts");
  redirect("/studio/accounts");
}

export async function disconnectSocialAction(formData: FormData) {
  const ctx = await requireWorkspaceContext();
  const id = String(formData.get("accountId") ?? "");
  await disconnectSocialAccount({ workspaceId: ctx.workspace.id, userId: ctx.user.id, accountId: id });
  revalidatePath("/studio/accounts");
  redirect("/studio/accounts");
}

export async function syncTikTokAccountAction(formData: FormData) {
  const ctx = await requireWorkspaceContext();
  const id = String(formData.get("accountId") ?? "");
  const account = await prisma.socialAccount.findFirst({
    where: { id, workspaceId: ctx.workspace.id, platform: "TIKTOK" },
  });
  if (account?.provider === "UPLOAD_POST") {
    await syncUploadPostAccounts(ctx.workspace.id);
    await syncUploadPostAnalytics(ctx.workspace.id).catch(() => undefined);
  } else if (account && !account.mock) {
    await syncTikTokAccountMetrics(account);
  }
  revalidatePath("/studio/accounts");
  revalidatePath("/studio/metrics/accounts");
  redirect("/studio/accounts");
}

export async function syncMetaAccountAction(formData: FormData) {
  const ctx = await requireWorkspaceContext();
  const id = String(formData.get("accountId") ?? "");
  const account = await prisma.socialAccount.findFirst({
    where: { id, workspaceId: ctx.workspace.id, platform: { in: ["INSTAGRAM", "FACEBOOK"] } },
  });
  if (account?.provider === "UPLOAD_POST") {
    await syncUploadPostAccounts(ctx.workspace.id);
    await syncUploadPostAnalytics(ctx.workspace.id).catch(() => undefined);
  } else if (account && !account.mock) {
    if (account.platform === "INSTAGRAM") await syncInstagramAccountMetrics(account);
    else await syncFacebookAccountMetrics(account);
  }
  revalidatePath("/studio/accounts");
  revalidatePath("/studio/metrics/accounts");
  redirect("/studio/accounts");
}

export async function syncXAccountAction(formData: FormData) {
  const ctx = await requireWorkspaceContext();
  const id = String(formData.get("accountId") ?? "");
  const account = await prisma.socialAccount.findFirst({
    where: { id, workspaceId: ctx.workspace.id, platform: "X" },
  });
  if (account?.provider === "UPLOAD_POST") {
    await syncUploadPostAccounts(ctx.workspace.id);
    await syncUploadPostAnalytics(ctx.workspace.id).catch(() => undefined);
  } else if (account && !account.mock) {
    await syncXAccountMetrics(account);
  }
  revalidatePath("/studio/accounts");
  revalidatePath("/studio/metrics/accounts");
  redirect("/studio/accounts");
}

export async function syncYouTubeAccountAction(formData: FormData) {
  const ctx = await requireWorkspaceContext();
  const id = String(formData.get("accountId") ?? "");
  const account = await prisma.socialAccount.findFirst({
    where: { id, workspaceId: ctx.workspace.id, platform: "YOUTUBE" },
  });
  if (account?.provider === "UPLOAD_POST") {
    await syncUploadPostAccounts(ctx.workspace.id);
    await syncUploadPostAnalytics(ctx.workspace.id).catch(() => undefined);
  } else if (account && !account.mock) {
    await syncYouTubeAccountMetrics(account);
  }
  revalidatePath("/studio/accounts");
  revalidatePath("/studio/metrics/accounts");
  redirect("/studio/accounts");
}
