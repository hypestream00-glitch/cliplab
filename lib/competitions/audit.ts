import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/generated/prisma/client";

export async function writeCompetitionAudit(params: {
  competitionId: string;
  actorUserId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const metadata = (params.metadata ?? undefined) as Prisma.InputJsonValue | undefined;
  await prisma.competitionAuditLog.create({
    data: {
      competitionId: params.competitionId,
      actorUserId: params.actorUserId ?? null,
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId ?? null,
      metadata,
    },
  });
  await prisma.auditLog.create({
    data: {
      userId: params.actorUserId ?? null,
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId ?? null,
      metadata: { competitionId: params.competitionId, ...(params.metadata ?? {}) } as Prisma.InputJsonValue,
    },
  });
}
