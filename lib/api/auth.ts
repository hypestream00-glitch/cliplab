import { prisma } from "@/lib/db/prisma";
import { hashToken } from "@/lib/security/crypto";

export async function authenticateApiKey(request: Request) {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return null;
  const raw = header.slice(7);
  const hashedKey = hashToken(raw);
  const key = await prisma.apiKey.findUnique({
    where: { hashedKey },
    include: { workspace: true },
  });
  if (!key || key.revokedAt) return null;
  await prisma.apiKey.update({ where: { id: key.id }, data: { lastUsedAt: new Date() } });
  return key;
}
