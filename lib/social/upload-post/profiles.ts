import { prisma } from "@/lib/db/prisma";
import { isPrismaUniqueViolation } from "@/lib/webhooks/idempotency";
import { profileUsernameForWorkspace } from "@/lib/social/upload-post/config";
import { UploadPostPlanError } from "@/lib/social/upload-post/errors";
import { uploadPostJson, uploadPostRequest } from "@/lib/social/upload-post/http";
import type { UploadPostProfile } from "@/generated/prisma/client";

const inflight = new Map<string, Promise<UploadPostProfile>>();

export type UploadPostRemoteProfile = {
  username: string;
  created_at?: string;
  social_accounts?: Record<string, unknown>;
};

type UsersListResponse = {
  success?: boolean;
  limit?: number;
  plan?: string;
  profiles?: UploadPostRemoteProfile[];
};

type UserGetResponse = {
  success?: boolean;
  profile?: UploadPostRemoteProfile;
};

type MeResponse = {
  success?: boolean;
  plan?: string;
  email?: string;
};

export async function getUploadPostMe() {
  return uploadPostJson<MeResponse>({ method: "GET", path: "/uploadposts/me" });
}

export async function listUploadPostUsers() {
  return uploadPostJson<UsersListResponse>({ method: "GET", path: "/uploadposts/users" });
}

export async function getUploadPostUser(username: string) {
  return uploadPostJson<UserGetResponse>({
    method: "GET",
    path: `/uploadposts/users/${encodeURIComponent(username)}`,
  });
}

export async function requireWorkspaceUploadPostProfile(workspaceId: string) {
  const profile = await prisma.uploadPostProfile.findUnique({ where: { workspaceId } });
  if (!profile) {
    throw new Error("Perfil Upload-Post não encontrado para este workspace.");
  }
  return profile;
}

export async function assertWorkspaceOwnsUploadPostUsername(workspaceId: string, username: string) {
  const profile = await prisma.uploadPostProfile.findUnique({ where: { workspaceId } });
  if (!profile || profile.username !== username) {
    throw new Error("Perfil Upload-Post não pertence a este workspace.");
  }
  return profile;
}

export async function ensureUploadPostProfile(workspaceId: string) {
  const existing = await prisma.uploadPostProfile.findUnique({ where: { workspaceId } });
  if (existing) return persistProviderProfileId(existing);
  const pending = inflight.get(workspaceId);
  if (pending) return pending;
  const promise = createLocalProfile(workspaceId).finally(() => inflight.delete(workspaceId));
  inflight.set(workspaceId, promise);
  return promise;
}

async function createLocalProfile(workspaceId: string) {
  const raced = await prisma.uploadPostProfile.findUnique({ where: { workspaceId } });
  if (raced) return persistProviderProfileId(raced);

  const username = profileUsernameForWorkspace(workspaceId);
  const created = await createRemoteProfile(username);
  try {
    return await prisma.uploadPostProfile.create({
      data: {
        workspaceId,
        username: created.username,
        status: "ACTIVE",
        planName: created.plan,
        planLimit: created.limit,
        lastSyncAt: new Date(),
        metadata: { source: "upload-post", providerProfileId: created.username },
      },
    });
  } catch (error) {
    if (isPrismaUniqueViolation(error)) {
      const local = await prisma.uploadPostProfile.findUnique({ where: { workspaceId } });
      if (local) return persistProviderProfileId(local);
    }
    throw error;
  }
}

async function createRemoteProfile(username: string) {
  const result = await uploadPostRequest({
    method: "POST",
    path: "/uploadposts/users",
    json: { username },
  });
  if (result.status === 409) {
    const listed = await listUploadPostUsers();
    const found = listed.profiles?.find((item) => item.username === username);
    return { username, plan: listed.plan, limit: listed.limit, remote: found };
  }
  if (result.status === 403) {
    const record = result.json && typeof result.json === "object" ? (result.json as { error_code?: string }) : {};
    if (record.error_code === "PROFILE_LIMIT_REACHED") {
      throw new UploadPostPlanError("Limite de perfis sociais atingido no plano atual.", "PROFILE_LIMIT_REACHED");
    }
  }
  if (result.status >= 400) {
    const { parseUploadPostError } = await import("@/lib/social/upload-post/http");
    throw parseUploadPostError(result.status, result.json, "Não foi possível criar o perfil Upload-Post.");
  }
  const listed = await listUploadPostUsers().catch(() => ({ plan: undefined, limit: undefined }) as UsersListResponse);
  return { username, plan: listed.plan, limit: listed.limit };
}

export async function refreshUploadPostProfile(workspaceId: string) {
  const profile = await ensureUploadPostProfile(workspaceId);
  const listed = await listUploadPostUsers();
  const remote = listed.profiles?.find((item) => item.username === profile.username);
  await prisma.uploadPostProfile.update({
    where: { id: profile.id },
    data: {
      planName: listed.plan ?? profile.planName,
      planLimit: listed.limit ?? profile.planLimit,
      lastSyncAt: new Date(),
      metadata: JSON.parse(JSON.stringify({
        ...asObject(profile.metadata),
        social_accounts: remote?.social_accounts ?? null,
      })),
    },
  });
  return getUploadPostUser(profile.username);
}

export async function deleteUploadPostProfile(workspaceId: string) {
  const profile = await prisma.uploadPostProfile.findUnique({ where: { workspaceId } });
  if (!profile) return;
  await uploadPostJson({ method: "DELETE", path: "/uploadposts/users", json: { username: profile.username } });
  await prisma.uploadPostProfile.update({
    where: { id: profile.id },
    data: { status: "DELETED" },
  });
}

async function persistProviderProfileId(profile: UploadPostProfile) {
  const meta = asObject(profile.metadata);
  if (meta.providerProfileId === profile.username) return profile;
  return prisma.uploadPostProfile.update({
    where: { id: profile.id },
    data: {
      metadata: JSON.parse(JSON.stringify({
        ...meta,
        source: meta.source ?? "upload-post",
        providerProfileId: profile.username,
      })),
    },
  });
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}
