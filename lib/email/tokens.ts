import { prisma } from "@/lib/db/prisma";
import { hashToken, randomToken } from "@/lib/security/crypto";

export type AuthTokenKind = "verify" | "reset" | "autologin";

const TTL_MS: Record<AuthTokenKind, number> = {
  verify: 1000 * 60 * 60 * 24,
  reset: 1000 * 60 * 30,
  autologin: 1000 * 60 * 5,
};

export function tokenIdentifier(kind: AuthTokenKind, email: string) {
  return `${kind}:${email.toLowerCase()}`;
}

export async function issueAuthToken(kind: AuthTokenKind, email: string) {
  const normalized = email.toLowerCase();
  const identifier = tokenIdentifier(kind, normalized);
  const raw = randomToken();
  const token = hashToken(raw);
  await prisma.verificationToken.deleteMany({ where: { identifier } });
  await prisma.verificationToken.create({
    data: {
      identifier,
      token,
      expires: new Date(Date.now() + TTL_MS[kind]),
    },
  });
  return raw;
}

export async function consumeAuthToken(kind: AuthTokenKind, raw: string) {
  const token = hashToken(raw);
  const record = await prisma.verificationToken.findFirst({
    where: { token, identifier: { startsWith: `${kind}:` } },
  });
  if (!record) return { ok: false as const, reason: "invalid" as const };
  if (record.expires.getTime() <= Date.now()) {
    await prisma.verificationToken.deleteMany({ where: { identifier: record.identifier } });
    return { ok: false as const, reason: "expired" as const, email: record.identifier.slice(kind.length + 1) };
  }
  await prisma.verificationToken.deleteMany({ where: { identifier: record.identifier } });
  const email = record.identifier.slice(kind.length + 1);
  return { ok: true as const, email };
}

export async function latestTokenIssuedAt(kind: AuthTokenKind, email: string) {
  const identifier = tokenIdentifier(kind, email);
  const record = await prisma.verificationToken.findFirst({
    where: { identifier },
    orderBy: { expires: "desc" },
  });
  if (!record) return null;
  return new Date(record.expires.getTime() - TTL_MS[kind]);
}
