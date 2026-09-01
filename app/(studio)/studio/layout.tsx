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
import { ensureReferralProfile } from "@/lib/referral/profile";
import { referralStats } from "@/lib/referral/reward";
import { appPathUrl } from "@/lib/email/app-url";

export const dynamic = "force-dynamic";

export default async function StudioLayout({ children }: LayoutChildrenProps) {
  ensureDevWorkers();
  const ctx = await requireWorkspaceContext();
  const user = await prisma.user.findUniqueOrThrow({ where: { id: ctx.user.id } });
  if (!user.onboardingCompleted) redirect("/onboarding");

  const [credits, notifications, usage, referralProfile, stats] = await Promise.all([
    getDisplayCredits(ctx.workspace.id),
    prisma.notification.findMany({
      where: { userId: user.id, workspaceId: ctx.workspace.id },
      orderBy: { createdAt: "desc" },
      take: 24,
    }),
    getMonthlyUsage(ctx.workspace.id),
    ensureReferralProfile(user.id),
    referralStats(user.id),
  ]);
  const prefs = parseNotificationPrefs(user.notificationPrefs);
  const visibleNotifications = notifications
    .filter((item) => notificationAllowed(item.type, prefs) && isUserVisibleNotification(item.title, item.body))
    .slice(0, 12);

  const planLimits = usage.limits;
  const identity = toSessionIdentity(user);
  const usedPercent = planLimits.monthlyMinutes > 0 ? (usage.usedSeconds / (planLimits.monthlyMinutes * 60)) * 100 : 0;
  const grantLabel =
    usage.activeGrant?.source === "PROMO"
      ? `${usage.activeGrant.daysLeft} dia${usage.activeGrant.daysLeft === 1 ? "" : "s"} grátis restantes`
      : usage.activeGrant?.source === "REFERRAL"
        ? `${usage.activeGrant.daysLeft} dia${usage.activeGrant.daysLeft === 1 ? "" : "s"} de Pro restantes`
        : null;

  return (
    <AppShell
      user={{ ...identity, image: user.image }}
      workspaces={ctx.memberships}
      currentWorkspaceId={ctx.workspace.id}
      credits={credits.available}
      planName={planLimits.name}
      workspaceName={ctx.workspace.name}
      usageLabel={formatMinutesUsed(usage.usedSeconds, planLimits.monthlyMinutes)}
      usagePercent={usedPercent}
      grantLabel={grantLabel}
      referral={{
        url: appPathUrl(`/r/${referralProfile.code}`),
        invited: stats.invited,
        converted: stats.converted,
        rewardDays: stats.rewardDays,
      }}
      notifications={visibleNotifications}
    >
      {children}
    </AppShell>
  );
}
