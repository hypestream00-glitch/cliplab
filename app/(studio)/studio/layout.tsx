import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { requireWorkspaceContext } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { ensureDevWorkers } from "@/lib/queue/boot";
import { parseNotificationPrefs, notificationAllowed } from "@/lib/notifications/prefs";
import type { LayoutChildrenProps } from "@/types/routes";
import { getDisplayCredits } from "@/lib/data/credits-display";
import { isUserVisibleNotification } from "@/lib/data/classify";
import { formatMinutesUsed, getMonthlyUsage } from "@/lib/billing/usage";
import { toSessionIdentity } from "@/lib/auth/identity";

export const dynamic = "force-dynamic";

export default async function StudioLayout({ children }: LayoutChildrenProps) {
  ensureDevWorkers();
  const ctx = await requireWorkspaceContext();
  const user = await prisma.user.findUniqueOrThrow({ where: { id: ctx.user.id } });
  if (!user.onboardingCompleted) redirect("/onboarding");

  const [credits, notifications, usage] = await Promise.all([
    getDisplayCredits(ctx.workspace.id),
    prisma.notification.findMany({
      where: { userId: user.id, workspaceId: ctx.workspace.id },
      orderBy: { createdAt: "desc" },
      take: 24,
    }),
    getMonthlyUsage(ctx.workspace.id),
  ]);
  const prefs = parseNotificationPrefs(user.notificationPrefs);
  const visibleNotifications = notifications
    .filter((item) => notificationAllowed(item.type, prefs) && isUserVisibleNotification(item.title, item.body))
    .slice(0, 12);

  const planLimits = usage.limits;
  const identity = toSessionIdentity(user);

  return (
    <AppShell
      user={{ ...identity, image: user.image }}
      workspaces={ctx.memberships}
      currentWorkspaceId={ctx.workspace.id}
      credits={credits.available}
      planName={planLimits.name}
      workspaceName={ctx.workspace.name}
      usageLabel={formatMinutesUsed(usage.usedSeconds, planLimits.monthlyMinutes)}
      notifications={visibleNotifications}
    >
      {children}
    </AppShell>
  );
}
