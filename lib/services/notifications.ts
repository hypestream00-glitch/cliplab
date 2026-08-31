import { prisma } from "@/lib/db/prisma";
import type { NotificationType } from "@/generated/prisma/client";
import { notificationAllowed, parseNotificationPrefs } from "@/lib/notifications/prefs";

export async function notifyWorkspace(params: {
  workspaceId: string;
  type: NotificationType;
  title: string;
  body: string;
  entityType?: string;
  entityId?: string;
}) {
  const members = await prisma.workspaceMember.findMany({
    where: { workspaceId: params.workspaceId, role: { in: ["OWNER", "ADMIN"] } },
    include: { user: { select: { id: true, notificationPrefs: true } } },
  });
  for (const member of members) {
    const prefs = parseNotificationPrefs(member.user.notificationPrefs);
    if (!notificationAllowed(params.type, prefs)) continue;
    await prisma.notification.create({
      data: {
        workspaceId: params.workspaceId,
        userId: member.user.id,
        type: params.type,
        title: params.title,
        body: params.body,
        entityType: params.entityType,
        entityId: params.entityId,
      },
    });
  }
}
