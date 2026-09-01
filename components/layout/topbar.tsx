"use client";

import { Menu, PanelLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AppBreadcrumb } from "@/components/layout/breadcrumb";
import { NotificationCenter, type NotificationItem } from "@/components/layout/notification-center";
import { UserMenu } from "@/components/layout/user-menu";
import { ReferralButton, type ReferralModalProps } from "@/components/layout/referral-button";

export function Topbar({
  user,
  notifications,
  referral,
  onToggleCollapsed,
  onOpenMobile,
}: {
  user: { name?: string | null; email?: string | null; image?: string | null };
  notifications: NotificationItem[];
  referral?: ReferralModalProps | null;
  onToggleCollapsed: () => void;
  onOpenMobile: () => void;
}) {
  return (
    <header className="flex h-12 shrink-0 items-center gap-3 border-b bg-background/95 px-3 backdrop-blur">
      <Button variant="ghost" size="icon-sm" className="md:hidden" onClick={onOpenMobile} aria-label="Abrir menu">
        <Menu className="size-4" />
      </Button>
      <Button variant="ghost" size="icon-sm" className="hidden md:inline-flex" onClick={onToggleCollapsed} aria-label="Recolher sidebar">
        <PanelLeft className="size-4" />
      </Button>
      <AppBreadcrumb />
      <div className="ml-auto flex items-center gap-1.5">
        {referral ? <ReferralButton {...referral} /> : null}
        <NotificationCenter items={notifications} />
        <div className="md:hidden">
          <UserMenu name={user.name} email={user.email} image={user.image} />
        </div>
      </div>
    </header>
  );
}
