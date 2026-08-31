import type { Prisma } from "@/generated/prisma/client";
import { isDemoDataEnabled } from "@/lib/data/demo-mode";

export function visibleProjectWhere(workspaceId?: string): Prisma.ProjectWhereInput {
  const where: Prisma.ProjectWhereInput = {};
  if (workspaceId) where.workspaceId = workspaceId;
  if (!isDemoDataEnabled()) where.isDemo = false;
  return where;
}

export function visibleClipWhere(workspaceId?: string): Prisma.ClipWhereInput {
  const where: Prisma.ClipWhereInput = {};
  if (workspaceId) where.workspaceId = workspaceId;
  if (!isDemoDataEnabled()) where.project = { isDemo: false };
  return where;
}

export function visibleClipLibraryWhere(workspaceId?: string): Prisma.ClipWhereInput {
  return {
    AND: [visibleClipWhere(workspaceId), isDemoDataEnabled() ? {} : { storageKey: { not: null } }],
  };
}

export function visiblePublicationWhere(workspaceId?: string): Prisma.SocialPublicationWhereInput {
  const where: Prisma.SocialPublicationWhereInput = {};
  if (workspaceId) where.workspaceId = workspaceId;
  if (!isDemoDataEnabled()) {
    where.mock = false;
    where.OR = [{ clipId: null }, { clip: { project: { isDemo: false } } }];
  }
  return where;
}

export function visibleSocialAccountWhere(workspaceId?: string): Prisma.SocialAccountWhereInput {
  const where: Prisma.SocialAccountWhereInput = {};
  if (workspaceId) where.workspaceId = workspaceId;
  if (!isDemoDataEnabled()) where.mock = false;
  return where;
}

export function visibleScheduleWhere(workspaceId?: string): Prisma.ScheduleWhereInput {
  const where: Prisma.ScheduleWhereInput = {};
  if (workspaceId) where.workspaceId = workspaceId;
  if (!isDemoDataEnabled()) {
    where.publication = { mock: false, OR: [{ clipId: null }, { clip: { project: { isDemo: false } } }] };
  }
  return where;
}

export function visibleLiveChannelWhere(workspaceId?: string): Prisma.LiveChannelWhereInput {
  const where: Prisma.LiveChannelWhereInput = {};
  if (workspaceId) where.workspaceId = workspaceId;
  if (!isDemoDataEnabled()) {
    where.NOT = { username: { in: ["anademo", "ana.clips"] } };
  }
  return where;
}

export function visibleMetricSnapshotWhere(workspaceId?: string): Prisma.SocialMetricSnapshotWhereInput {
  return {
    socialAccount: visibleSocialAccountWhere(workspaceId),
  };
}
