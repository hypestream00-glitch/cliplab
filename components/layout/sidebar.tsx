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
        collapsed ? "w-[72px]" : "w-[248px]",
      )}
    >
      <div className={cn("flex h-14 items-center border-b border-sidebar-border px-3", collapsed && "justify-center px-0")}>
        <Link href="/studio" className="flex items-center gap-2.5" onClick={onNavigate}>
          <span className="flex size-8 items-center justify-center rounded-xl gradient-brand text-[13px] font-bold text-white">
            C
          </span>
          {!collapsed && <span className="text-[14px] font-semibold tracking-tight">{brand.name}</span>}
        </Link>
      </div>

      <div className={cn("px-2 pt-3", collapsed && "px-1.5")}>
        <Link
          href="/studio/create"
          onClick={onNavigate}
          aria-label="Novo projeto"
          className={cn(
            "inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-lg gradient-brand text-[13px] font-semibold text-white transition hover:opacity-90",
            collapsed && "px-0",
          )}
        >
          <Plus className="size-4" />
          {!collapsed && <span>Novo projeto</span>}
        </Link>
      </div>

      <nav className="mt-2 flex-1 overflow-y-auto px-2 pb-3" aria-label="Navegação principal">
        {studioNavGroups.map((group, index) => (
          <div key={group.id} className={cn(index > 0 && "mt-3 border-t border-sidebar-border pt-3")}>
            {group.items.map((item) => {
              const active = isActive(pathname, item.href, allHrefs);
              const Icon = item.icon;
              const link = (
                <Link
                  href={item.href}
                  onClick={onNavigate}
                  className={cn(
                    "mb-0.5 flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-[13px] font-medium transition-colors",
                    collapsed && "justify-center px-0",
                    active
                      ? "bg-sidebar-accent text-white glow-nav"
                      : "text-muted-foreground hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground",
                  )}
                >
                  <Icon className={cn("size-4 shrink-0", active && "text-white")} />
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

      <div className="space-y-2 border-t border-sidebar-border p-2">
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
        <div className={cn("flex items-center gap-2 rounded-lg px-2 py-1.5", collapsed && "justify-center px-0")}>
          {collapsed ? (
            <UserMenu name={user.name} email={user.email} image={user.image} workspaceName={workspaceName} planName={planName} />
          ) : (
            <>
              <Avatar className="size-8">
                {user.image ? <AvatarImage src={user.image} alt={user.name ?? ""} /> : null}
                <AvatarFallback className="text-[10px]">{initials(user.name)}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12px] font-medium">{user.name ?? user.email ?? "Conta"}</p>
                <p className="truncate text-[11px] text-muted-foreground">{user.email ?? planName}</p>
              </div>
              <UserMenu name={user.name} email={user.email} image={user.image} workspaceName={workspaceName} planName={planName} />
            </>
          )}
        </div>
      </div>
    </aside>
  );
}
