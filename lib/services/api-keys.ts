import { prisma } from "@/lib/db/prisma";
import { hashToken, randomToken } from "@/lib/security/crypto";

export async function createApiKey(params: {
  workspaceId: string;
  userId: string;
  name: string;
  scopes: string[];
}) {
  const raw = `clp_${randomToken(24)}`;
  const prefix = raw.slice(0, 12);
  const record = await prisma.apiKey.create({
    data: {
      workspaceId: params.workspaceId,
      userId: params.userId,
      name: params.name,
      prefix,
      hashedKey: hashToken(raw),
      scopes: params.scopes,
    },
  });
  return { record, secret: raw };
}

export async function revokeApiKey(workspaceId: string, keyId: string) {
  const key = await prisma.apiKey.findFirst({ where: { id: keyId, workspaceId } });
  if (!key || key.revokedAt) return null;
  return prisma.apiKey.update({
    where: { id: key.id },
    data: { revokedAt: new Date() },
  });
}
