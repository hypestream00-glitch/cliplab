import { prisma } from "@/lib/db/prisma";
import { isPrismaUniqueViolation } from "@/lib/webhooks/idempotency";
import type { Prisma } from "@/generated/prisma/client";

type Db = Prisma.TransactionClient | typeof prisma;

export async function writeAuditLog(
  params: {
    action: string;
    entityType: string;
    entityId?: string | null;
    userId?: string | null;
    workspaceId?: string | null;
    metadata?: Record<string, unknown>;
  },
  tx?: Db,
) {
  const db = tx ?? prisma;
  await db.auditLog.create({
    data: {
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId ?? null,
      metadata: (params.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
    },
  });
}

export async function writeAdminAction(params: {
  adminId: string;
  action: string;
  entityType: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
}) {
  await prisma.adminAction
    .create({
      data: {
        adminId: params.adminId,
        action: params.action,
        entityType: params.entityType,
        entityId: params.entityId,
        metadata: (params.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    })
    .catch(() => undefined);
}

export async function lockWalletUser(tx: { $executeRaw: typeof prisma.$executeRaw }, userId: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${userId}))`;
}

export function isUnique(error: unknown) {
  return isPrismaUniqueViolation(error);
}
