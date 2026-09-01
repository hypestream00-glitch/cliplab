"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Plus } from "lucide-react";
import { brand } from "@/lib/config/brand";
import { studioMoreItems, studioNavGroups } from "@/lib/config/navigation";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { WorkspaceSwitcher } from "@/components/layout/workspace-switcher";
import { CreditsWidget } from "@/components/layout/credits-widget";
import { CouponCard } from "@/components/layout/coupon-card";
import { UserMenu } from "@/components/layout/user-menu";
import { initials } from "@/lib/utils/format";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import type { Workspace, WorkspaceMember } from "@/generated/prisma/client";

type Props = {
  collapsed: boolean;
  forceVisible?: boolean;
  workspaces: Array<WorkspaceMember & { workspace: Workspace }>;
  currentWorkspaceId: string;
  credits: number | null;
  planName: string;
  workspaceName: string;
  usageLabel?: string;
  usagePercent?: number;
  grantLabel?: string | null;
  user: { name?: string | null; email?: string | null; image?: string | null };
  onNavigate?: () => void;
};

function isActive(pathname: string, href: string, allHrefs: string[]) {
  if (href === "/studio") return pathname === "/studio";
  if (href === "/studio/calendar") {
    return pathname === "/studio/calendar" || pathname.startsWith("/studio/publishing/calendar");
  }
  if (href === "/studio/analytics") {
    return pathname === "/studio/analytics" || pathname.startsWith("/studio/metrics");
  }
  if (href === "/studio/credits") {
    return pathname === "/studio/credits" || pathname.startsWith("/studio/settings/billing");
  }
  const moreSpecific = allHrefs.some(
    (other) => other !== href && other.startsWith(`${href}/`) && (pathname === other || pathname.startsWith(`${other}/`)),
  );
  return pathname === href || (pathname.startsWith(`${href}/`) && !moreSpecific);
}

export function Sidebar({
  collapsed,
  forceVisible,
  workspaces,
  currentWorkspaceId,
  credits,
  planName,
  workspaceName,
  usageLabel,
  usagePercent,
  grantLabel,
  user,
  onNavigate,
}: Props) {
  const pathname = usePathname();
  const allHrefs = [...studioNavGroups.flatMap((group) => group.items.map((item) => item.href)), ...studioMoreItems.map((item) => item.href)];

  return (
    <aside
      data-collapsed={collapsed}
      className={cn(
        "h-screen shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground",
        forceVisible ? "flex w-full" : "hidden md:flex",
        collapsed ? "w-[80px]" : "w-[280px]",
      )}
    >
      <div className={cn("flex h-16 items-center border-b border-sidebar-border px-4", collapsed && "justify-center px-0")}>
        <Link href="/studio" className="flex items-center gap-3" onClick={onNavigate}>
          <span className="flex size-9 items-center justify-center rounded-lg gradient-brand text-[15px] font-bold text-white shadow-[0_0_18px_rgba(233,42,203,0.35)]">
            C
          </span>
          {!collapsed && <span className="text-[16px] font-semibold tracking-tight text-white">{brand.name}</span>}
        </Link>
      </div>

      <div className={cn("px-3 pt-4", collapsed && "px-2")}>
        <Link
          href="/studio/create"
          onClick={onNavigate}
          aria-label="Novo projeto"
          className={cn(
            "inline-flex h-11 w-full items-center justify-center gap-1.5 rounded-xl gradient-primary text-[14px] font-semibold text-white transition hover:opacity-90 glow-primary",
            collapsed && "px-0",
          )}
        >
          <Plus className="size-4" />
          {!collapsed && <span>Novo projeto</span>}
        </Link>
      </div>

      <nav className="mt-3 flex-1 overflow-y-auto px-3 pb-4" aria-label="Navegação principal">
        {studioNavGroups.map((group, index) => (
          <div key={group.id} className={cn(index > 0 && "mt-4 border-t border-sidebar-border pt-4")}>
            {group.items.map((item) => {
              const active = isActive(pathname, item.href, allHrefs);
              const Icon = item.icon;
              const link = (
                <Link
                  href={item.href}
                  onClick={onNavigate}
                  className={cn(
                    "mb-1 flex h-10 items-center gap-3 rounded-xl px-3 text-[14px] font-medium transition-colors",
                    collapsed && "justify-center px-0",
                    active
                      ? "border border-magenta/50 bg-magenta/10 text-white glow-primary"
                      : "border border-transparent text-text-secondary hover:bg-surface-hover hover:text-white",
                  )}
                >
                  <Icon className={cn("size-4 shrink-0", active ? "text-magenta" : "text-text-secondary")} />
                  {!collapsed && <span className="truncate">{item.label}</span>}
                </Link>
              );
              if (!collapsed) return <div key={item.href}>{link}</div>;
              return (
                <Tooltip key={item.href}>
                  <TooltipTrigger asChild>{link}</TooltipTrigger>
                  <TooltipContent side="right">{item.label}</TooltipContent>
                </Tooltip>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="space-y-3 border-t border-sidebar-border p-3">
        <CouponCard collapsed={collapsed} />
        <WorkspaceSwitcher collapsed={collapsed} workspaces={workspaces} currentWorkspaceId={currentWorkspaceId} />
        <CreditsWidget
          collapsed={collapsed}
          credits={credits}
          planName={planName}
          usageLabel={usageLabel}
          usagePercent={usagePercent}
          grantLabel={grantLabel}
        />
        <div className={cn("flex items-center gap-3 rounded-xl px-1 py-1.5", collapsed && "justify-center px-0")}>
          {collapsed ? (
            <UserMenu name={user.name} email={user.email} image={user.image} workspaceName={workspaceName} planName={planName} />
          ) : (
            <>
              <div className="rounded-full p-[2px] gradient-primary">
                <Avatar className="size-9 after:hidden">
                  {user.image ? <AvatarImage src={user.image} alt={user.name ?? ""} /> : null}
                  <AvatarFallback className="bg-[#12121a] text-[11px] text-white">{initials(user.name)}</AvatarFallback>
                </Avatar>
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium text-white">{user.name ?? user.email ?? "Conta"}</p>
                <p className="truncate text-[12px] text-text-secondary">{user.email ?? planName}</p>
              </div>
              <UserMenu name={user.name} email={user.email} image={user.image} workspaceName={workspaceName} planName={planName} />
            </>
          )}
        </div>
      </div>
    </aside>
  );
}
