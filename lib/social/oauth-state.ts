import { prisma } from "@/lib/db/prisma";
import { createOAuthState, createPkcePair } from "@/lib/social/oauth";
import type { SocialPlatform } from "@/generated/prisma/client";

const TTL_MS = 10 * 60 * 1000;

export type OAuthStateRecord = {
  usedAt: Date | null;
  expiresAt: Date;
  workspaceId: string;
  userId: string;
  platform: SocialPlatform;
};

export function evaluateOAuthStateRecord(
  record: OAuthStateRecord | null,
  params: { workspaceId: string; userId: string; platform: SocialPlatform },
  now = Date.now(),
): "ok" | "missing" | "used" | "expired" | "mismatch" {
  if (!record) return "missing";
  if (record.usedAt) return "used";
  if (record.expiresAt.getTime() < now) return "expired";
  if (record.workspaceId !== params.workspaceId || record.userId !== params.userId || record.platform !== params.platform) {
    return "mismatch";
  }
  return "ok";
}

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
  if (!record || evaluateOAuthStateRecord(record, params) !== "ok") return null;
  const updated = await prisma.socialOAuthState.updateMany({
    where: { id: record.id, usedAt: null },
    data: { usedAt: new Date() },
  });
  if (updated.count !== 1) return null;
  return record;
}
