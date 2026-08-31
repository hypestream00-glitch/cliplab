"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireWorkspaceContext } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { encryptSecret } from "@/lib/security/crypto";
import { consumeMetaPending, readMetaPending } from "@/lib/social/meta/pending";
import { META_GRAPH_BASE } from "@/lib/social/meta/config";
import { metaFetch } from "@/lib/social/meta/http";
import type { MetaProviderMeta } from "@/lib/social/meta/types";

export async function confirmMetaAccountsAction(formData: FormData) {
  const ctx = await requireWorkspaceContext();
  const pendingId = String(formData.get("pendingId") ?? "");
  const pending = await readMetaPending({ id: pendingId, workspaceId: ctx.workspace.id, userId: ctx.user.id });
  if (!pending) redirect("/studio/accounts?error=oauth-state");
  const selected = formData.getAll("selections").map(String);
  if (selected.length === 0) redirect(`/studio/accounts/meta?pending=${pendingId}&error=accounts`);

  const userExpiresAt = pending.discovery.userExpiresAt ? new Date(pending.discovery.userExpiresAt) : undefined;
  const userToken = pending.discovery.userAccessToken;

  for (const item of selected) {
    const [kind, pageId] = item.split(":");
    const page = pending.discovery.pages.find((entry) => entry.id === pageId);
    if (!page) continue;
    if (kind === "page") {
      const ok = await validatePage(page.pageAccessToken, page.id);
      await prisma.socialAccount.upsert({
        where: {
          workspaceId_platform_externalAccountId: {
            workspaceId: ctx.workspace.id,
            platform: "FACEBOOK",
            externalAccountId: page.id,
          },
        },
        create: {
          workspaceId: ctx.workspace.id,
          platform: "FACEBOOK",
          externalAccountId: page.id,
          username: page.name,
          displayName: page.name,
          avatarUrl: page.picture,
          accessTokenEncrypted: encryptSecret(page.pageAccessToken),
          refreshTokenEncrypted: encryptSecret(userToken),
          expiresAt: null,
          refreshExpiresAt: userExpiresAt,
          scopes: pending.row.scopes,
          status: ok && page.canCreateContent ? "CONNECTED" : page.canCreateContent ? "ERROR" : "CONFIGURATION_REQUIRED",
          lastSyncAt: ok ? new Date() : null,
          mock: false,
          providerMeta: {
            facebookUserId: pending.discovery.facebookUserId,
            pageId: page.id,
            tasks: page.tasks,
            canCreateContent: page.canCreateContent,
          } satisfies MetaProviderMeta,
        },
        update: {
          username: page.name,
          displayName: page.name,
          avatarUrl: page.picture,
          accessTokenEncrypted: encryptSecret(page.pageAccessToken),
          refreshTokenEncrypted: encryptSecret(userToken),
          expiresAt: null,
          refreshExpiresAt: userExpiresAt,
          scopes: pending.row.scopes,
          status: ok && page.canCreateContent ? "CONNECTED" : page.canCreateContent ? "ERROR" : "CONFIGURATION_REQUIRED",
          lastSyncAt: ok ? new Date() : null,
          mock: false,
          providerMeta: {
            facebookUserId: pending.discovery.facebookUserId,
            pageId: page.id,
            tasks: page.tasks,
            canCreateContent: page.canCreateContent,
          } satisfies MetaProviderMeta,
        },
      });
      await prisma.auditLog.create({
        data: {
          userId: ctx.user.id,
          workspaceId: ctx.workspace.id,
          action: "FACEBOOK_CONNECTED",
          entityType: "SocialAccount",
          entityId: page.id,
          metadata: { pageId: page.id },
        },
      });
    }
    if (kind === "ig" && page.instagram) {
      const ig = page.instagram;
      const ok = await validateIg(page.pageAccessToken, ig.id);
      await prisma.socialAccount.upsert({
        where: {
          workspaceId_platform_externalAccountId: {
            workspaceId: ctx.workspace.id,
            platform: "INSTAGRAM",
            externalAccountId: ig.id,
          },
        },
        create: {
          workspaceId: ctx.workspace.id,
          platform: "INSTAGRAM",
          externalAccountId: ig.id,
          username: ig.username,
          displayName: ig.name,
          avatarUrl: ig.avatarUrl,
          accessTokenEncrypted: encryptSecret(page.pageAccessToken),
          refreshTokenEncrypted: encryptSecret(userToken),
          expiresAt: null,
          refreshExpiresAt: userExpiresAt,
          scopes: pending.row.scopes,
          status: ok ? "CONNECTED" : "ERROR",
          lastSyncAt: ok ? new Date() : null,
          mock: false,
          providerMeta: {
            facebookUserId: pending.discovery.facebookUserId,
            pageId: page.id,
            igUserId: ig.id,
            accountType: ig.accountType,
            canCreateContent: page.canCreateContent,
          } satisfies MetaProviderMeta,
        },
        update: {
          username: ig.username,
          displayName: ig.name,
          avatarUrl: ig.avatarUrl,
          accessTokenEncrypted: encryptSecret(page.pageAccessToken),
          refreshTokenEncrypted: encryptSecret(userToken),
          expiresAt: null,
          refreshExpiresAt: userExpiresAt,
          scopes: pending.row.scopes,
          status: ok ? "CONNECTED" : "ERROR",
          lastSyncAt: ok ? new Date() : null,
          mock: false,
          providerMeta: {
            facebookUserId: pending.discovery.facebookUserId,
            pageId: page.id,
            igUserId: ig.id,
            accountType: ig.accountType,
            canCreateContent: page.canCreateContent,
          } satisfies MetaProviderMeta,
        },
      });
      await prisma.auditLog.create({
        data: {
          userId: ctx.user.id,
          workspaceId: ctx.workspace.id,
          action: "INSTAGRAM_CONNECTED",
          entityType: "SocialAccount",
          entityId: ig.id,
          metadata: { igUserId: ig.id, pageId: page.id },
        },
      });
    }
  }

  await consumeMetaPending(pending.row.id);
  revalidatePath("/studio/accounts");
  redirect("/studio/accounts?connected=meta");
}

async function validatePage(token: string, pageId: string) {
  const response = await metaFetch(`${META_GRAPH_BASE}/${encodeURIComponent(pageId)}?fields=id,name`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return response.ok;
}

async function validateIg(token: string, igUserId: string) {
  const response = await metaFetch(`${META_GRAPH_BASE}/${encodeURIComponent(igUserId)}?fields=id,username`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return response.ok;
}
