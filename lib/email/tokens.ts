import { prisma } from "@/lib/db/prisma";
import { hashToken, randomToken } from "@/lib/security/crypto";
import { normalizeRawToken } from "@/lib/email/token-encoding";

export type AuthTokenKind = "verify" | "reset" | "autologin";

const TTL_MS: Record<AuthTokenKind, number> = {
  verify: 1000 * 60 * 60 * 24,
  reset: 1000 * 60 * 30,
  autologin: 1000 * 60 * 5,
};

export function tokenIdentifier(kind: AuthTokenKind, email: string) {
  return `${kind}:${email.toLowerCase()}`;
}

export function tokenTtlMs(kind: AuthTokenKind) {
  return TTL_MS[kind];
}

function emailFromIdentifier(kind: AuthTokenKind, identifier: string) {
  return identifier.slice(kind.length + 1);
}

async function findAuthToken(kind: AuthTokenKind, raw: string) {
  const normalized = normalizeRawToken(raw);
  if (!normalized) return null;
  const token = hashToken(normalized);
  return prisma.verificationToken.findFirst({
    where: { token, identifier: { startsWith: `${kind}:` } },
  });
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

/** Validate without deleting. Safe for GET/prefetch/email scanners. */
export async function peekAuthToken(kind: AuthTokenKind, raw: string) {
  const record = await findAuthToken(kind, raw);
  if (!record) return { ok: false as const, reason: "invalid" as const };
  const email = emailFromIdentifier(kind, record.identifier);
  if (record.expires.getTime() <= Date.now()) {
    return { ok: false as const, reason: "expired" as const, email };
  }
  return { ok: true as const, email };
}

export async function consumeAuthToken(kind: AuthTokenKind, raw: string) {
  const record = await findAuthToken(kind, raw);
  if (!record) return { ok: false as const, reason: "invalid" as const };
  const email = emailFromIdentifier(kind, record.identifier);
  if (record.expires.getTime() <= Date.now()) {
    await prisma.verificationToken.deleteMany({ where: { identifier: record.identifier } });
    return { ok: false as const, reason: "expired" as const, email };
  }
  await prisma.verificationToken.deleteMany({ where: { identifier: record.identifier } });
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
