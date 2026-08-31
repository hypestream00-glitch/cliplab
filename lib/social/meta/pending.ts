import { prisma } from "@/lib/db/prisma";
import { encryptSecret, decryptSecret } from "@/lib/security/crypto";
import type { MetaDiscovery } from "@/lib/social/meta/types";
import type { SocialPlatform } from "@/generated/prisma/client";

const TTL_MS = 10 * 60 * 1000;

export async function createMetaPending(params: {
  workspaceId: string;
  userId: string;
  intent: SocialPlatform;
  discovery: MetaDiscovery;
  scopes: string[];
}) {
  const row = await prisma.metaPendingConnect.create({
    data: {
      workspaceId: params.workspaceId,
      userId: params.userId,
      intent: params.intent,
      payloadEncrypted: encryptSecret(JSON.stringify(params.discovery)),
      scopes: params.scopes,
      expiresAt: new Date(Date.now() + TTL_MS),
    },
  });
  return row.id;
}

export async function readMetaPending(params: { id: string; workspaceId: string; userId: string }) {
  const row = await prisma.metaPendingConnect.findFirst({
    where: { id: params.id, workspaceId: params.workspaceId, userId: params.userId, usedAt: null },
  });
  if (!row || row.expiresAt.getTime() < Date.now()) return null;
  const discovery = JSON.parse(decryptSecret(row.payloadEncrypted)) as MetaDiscovery;
  return { row, discovery };
}

export async function consumeMetaPending(id: string) {
  await prisma.metaPendingConnect.updateMany({
    where: { id, usedAt: null },
    data: { usedAt: new Date() },
  });
}
