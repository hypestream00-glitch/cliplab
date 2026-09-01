"use client";

import Link from "next/link";
import { CircleHelp, Menu, PanelLeft } from "lucide-react";
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
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-background/95 px-4 backdrop-blur md:px-6">
      <Button variant="ghost" size="icon-sm" className="md:hidden" onClick={onOpenMobile} aria-label="Abrir menu">
        <Menu className="size-4" />
      </Button>
      <Button variant="ghost" size="icon-sm" className="hidden md:inline-flex" onClick={onToggleCollapsed} aria-label="Recolher sidebar">
        <PanelLeft className="size-4" />
      </Button>
      <AppBreadcrumb />
      <div className="ml-auto flex items-center gap-2">
        {referral ? <ReferralButton {...referral} /> : null}
        <Button variant="ghost" size="icon-sm" asChild>
          <Link href="/studio/settings" aria-label="Ajuda e configurações">
            <CircleHelp className="size-4 text-text-secondary" />
          </Link>
        </Button>
        <NotificationCenter items={notifications} />
        <div className="md:hidden">
          <UserMenu name={user.name} email={user.email} image={user.image} />
        </div>
      </div>
    </header>
  );
}
