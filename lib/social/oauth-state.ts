import { prisma } from "@/lib/db/prisma";
import { createOAuthState, createPkcePair } from "@/lib/social/oauth";
import type { SocialPlatform } from "@/generated/prisma/client";

const TTL_MS = 10 * 60 * 1000;

export async function issueOAuthState(params: {
  workspaceId: string;
  userId: string;
  platform: SocialPlatform;
  redirectUri: string;
}) {
  const state = createOAuthState();
  const pkce = createPkcePair();
  await prisma.socialOAuthState.create({
    data: {
      workspaceId: params.workspaceId,
      userId: params.userId,
      platform: params.platform,
      state,
      codeVerifier: pkce.verifier,
      redirectUri: params.redirectUri,
      expiresAt: new Date(Date.now() + TTL_MS),
    },
  });
  return { state, verifier: pkce.verifier, challenge: pkce.challenge };
}

export async function consumeOAuthState(params: {
  state: string;
  workspaceId: string;
  userId: string;
  platform: SocialPlatform;
}) {
  const record = await prisma.socialOAuthState.findUnique({ where: { state: params.state } });
  if (!record) return null;
  if (record.usedAt) return null;
  if (record.expiresAt.getTime() < Date.now()) return null;
  if (record.workspaceId !== params.workspaceId || record.userId !== params.userId) return null;
  if (record.platform !== params.platform) return null;
  const updated = await prisma.socialOAuthState.updateMany({
    where: { id: record.id, usedAt: null },
    data: { usedAt: new Date() },
  });
  if (updated.count !== 1) return null;
  return record;
}
