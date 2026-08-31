import type { SocialPlatform } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";
import { fromUploadPostPlatform, toUploadPostPlatform } from "@/lib/social/upload-post/platforms";
import { ensureUploadPostProfile, getUploadPostUser } from "@/lib/social/upload-post/profiles";

type RemoteAccount = {
  username?: string;
  display_name?: string;
  social_images?: string;
  accountId?: string;
};

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function stringField(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === "string" ? value.trim() : "";
}

function parseRemoteAccount(value: unknown): RemoteAccount | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    return { username: trimmed, display_name: trimmed, accountId: trimmed };
  }
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const handle = stringField(record, "handle");
  const id = stringField(record, "username") || stringField(record, "id") || stringField(record, "user_id");
  const display_name = stringField(record, "display_name") || stringField(record, "displayName") || stringField(record, "nickname");
  const social_images = stringField(record, "social_images") || stringField(record, "avatar") || stringField(record, "profile_image");
  if (!handle && !id && !display_name) return null;
  return {
    accountId: id || handle || display_name,
    username: handle || id || display_name,
    display_name: display_name || handle || id,
    social_images: social_images || undefined,
  };
}

function disconnectedSet(metadata: unknown) {
  const meta = asObject(metadata);
  const list = Array.isArray(meta.disconnectedPlatforms) ? meta.disconnectedPlatforms : [];
  return new Set(list.filter((item): item is string => typeof item === "string"));
}

export async function syncUploadPostAccounts(workspaceId: string) {
  const profile = await ensureUploadPostProfile(workspaceId);
  const remote = await getUploadPostUser(profile.username);
  const social = asObject(remote.profile?.social_accounts);
  const skipped = disconnectedSet(profile.metadata);
  const seen = new Set<string>();
  const now = new Date();

  for (const [key, value] of Object.entries(social)) {
    const platform = fromUploadPostPlatform(key);
    if (!platform) continue;
    const parsed = parseRemoteAccount(value);
    if (!parsed) continue;
    if (skipped.has(platform)) continue;
    const externalAccountId = parsed.accountId || parsed.username || `${platform}:${profile.username}`;
    seen.add(`${platform}:${externalAccountId}`);
    await prisma.socialAccount.upsert({
      where: {
        workspaceId_platform_externalAccountId: {
          workspaceId,
          platform,
          externalAccountId,
        },
      },
      create: {
        workspaceId,
        platform,
        externalAccountId,
        username: parsed.username || profile.username,
        displayName: parsed.display_name || parsed.username || platform,
        avatarUrl: parsed.social_images ?? null,
        status: "CONNECTED",
        lastSyncAt: now,
        mock: false,
        provider: "UPLOAD_POST",
        providerProfileId: profile.username,
        providerMeta: { source: "upload-post", platformKey: key },
      },
      update: {
        username: parsed.username || profile.username,
        displayName: parsed.display_name || parsed.username || platform,
        avatarUrl: parsed.social_images ?? null,
        status: "CONNECTED",
        lastSyncAt: now,
        mock: false,
        provider: "UPLOAD_POST",
        providerProfileId: profile.username,
        providerMeta: { source: "upload-post", platformKey: key },
      },
    });
  }

  const existing = await prisma.socialAccount.findMany({
    where: { workspaceId, provider: "UPLOAD_POST" },
  });
  for (const account of existing) {
    const key = `${account.platform}:${account.externalAccountId}`;
    if (seen.has(key)) continue;
    await prisma.socialAccount.update({
      where: { id: account.id },
      data: { status: "EXPIRED", lastSyncAt: now },
    });
  }

  await prisma.uploadPostProfile.update({
    where: { id: profile.id },
    data: {
      lastSyncAt: now,
      metadata: JSON.parse(JSON.stringify({ ...asObject(profile.metadata), social_accounts: social })),
    },
  });

  return prisma.socialAccount.findMany({
    where: { workspaceId, provider: "UPLOAD_POST", status: { in: ["CONNECTED", "TOKEN_EXPIRING"] } },
    orderBy: { platform: "asc" },
  });
}

export async function disconnectUploadPostAccount(params: {
  workspaceId: string;
  userId: string;
  accountId: string;
}) {
  const account = await prisma.socialAccount.findFirst({
    where: { id: params.accountId, workspaceId: params.workspaceId },
  });
  if (!account || account.provider !== "UPLOAD_POST") return;
  const profile = await prisma.uploadPostProfile.findUnique({ where: { workspaceId: params.workspaceId } });
  if (profile) {
    const remote = await getUploadPostUser(profile.username).catch(() => null);
    const social = asObject(remote?.profile?.social_accounts);
    const apiKey = toUploadPostPlatform(account.platform);
    const remoteValue = apiKey ? social[apiKey] ?? social[apiKey === "twitter" ? "x" : apiKey] : undefined;
    const alreadyGone = !parseRemoteAccount(remoteValue);
    const meta = asObject(profile.metadata);
    const disconnected = disconnectedSet(meta);
    disconnected.add(account.platform);
    await prisma.uploadPostProfile.update({
      where: { id: profile.id },
      data: { metadata: JSON.parse(JSON.stringify({ ...meta, disconnectedPlatforms: [...disconnected], remoteAlreadyDisconnected: alreadyGone })) },
    });
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
      action: "ACCOUNT_DISCONNECTED",
      entityType: "SocialAccount",
      entityId: account.id,
      metadata: { platform: account.platform, provider: "UPLOAD_POST" },
    },
  });
}

export function reconnectPlatformHint(platform: SocialPlatform) {
  return platform;
}
