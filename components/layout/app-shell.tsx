"use client";

import { useCallback, useSyncExternalStore } from "react";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import type { NotificationItem } from "@/components/layout/notification-center";
import type { Workspace, WorkspaceMember } from "@/generated/prisma/client";
import { useState } from "react";

const COLLAPSE_KEY = "cliplab.sidebar-collapsed";
const COLLAPSE_EVENT = "cliplab-sidebar-collapsed";

function subscribeCollapsed(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange);
  window.addEventListener(COLLAPSE_EVENT, onStoreChange);
  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener(COLLAPSE_EVENT, onStoreChange);
  };
}

function collapsedSnapshot() {
  try {
    return window.localStorage.getItem(COLLAPSE_KEY) === "1";
  } catch {
    return false;
  }
}

type ShellProps = {
  user: { name?: string | null; email?: string | null; image?: string | null };
  workspaces: Array<WorkspaceMember & { workspace: Workspace }>;
  currentWorkspaceId: string;
  credits: number | null;
  planName: string;
  workspaceName: string;
  usageLabel: string;
  notifications: NotificationItem[];
  children: React.ReactNode;
};

export function AppShell({
  user,
  workspaces,
  currentWorkspaceId,
  credits,
  planName,
  workspaceName,
  usageLabel,
  notifications,
  children,
}: ShellProps) {
  const collapsed = useSyncExternalStore(subscribeCollapsed, collapsedSnapshot, () => false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const toggleCollapsed = useCallback(() => {
    try {
      window.localStorage.setItem(COLLAPSE_KEY, collapsed ? "0" : "1");
      window.dispatchEvent(new Event(COLLAPSE_EVENT));
    } catch {
      /* ignore */
    }
  }, [collapsed]);

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar
        collapsed={collapsed}
        workspaces={workspaces}
        currentWorkspaceId={currentWorkspaceId}
        credits={credits}
        planName={planName}
        workspaceName={workspaceName}
        usageLabel={usageLabel}
        user={user}
      />
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-[248px] p-0">
          <div className="md:hidden">
            <Sidebar
              forceVisible
              collapsed={false}
              workspaces={workspaces}
              currentWorkspaceId={currentWorkspaceId}
              credits={credits}
              planName={planName}
              workspaceName={workspaceName}
              usageLabel={usageLabel}
              user={user}
              onNavigate={() => setMobileOpen(false)}
            />
          </div>
        </SheetContent>
      </Sheet>
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          user={user}
          notifications={notifications}
          onToggleCollapsed={toggleCollapsed}
          onOpenMobile={() => setMobileOpen(true)}
        />
        <main className="min-h-0 flex-1 overflow-auto overflow-x-hidden px-4 py-5 md:px-6 md:py-6">{children}</main>
      </div>
    </div>
  );
}
