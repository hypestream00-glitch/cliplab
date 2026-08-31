"use client";

import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { fromNow } from "@/lib/utils/format";
import { cn } from "@/lib/utils";

export type NotificationItem = {
  id: string;
  title: string;
  body: string;
  createdAt: Date | string;
  readAt: Date | string | null;
};

export function NotificationCenter({ items }: { items: NotificationItem[] }) {
  const router = useRouter();
  const unread = items.filter((item) => !item.readAt).length;

  async function markAll() {
    await fetch("/api/notifications/read", { method: "POST" });
    router.refresh();
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon-sm" className="relative" aria-label="Notificações">
          <Bell className="size-4" />
          {unread > 0 && (
            <span className="absolute top-1 right-1 size-1.5 rounded-full bg-primary" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[360px] p-0">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <p className="text-[13px] font-medium">Notificações</p>
          <button className="text-[12px] text-muted-foreground hover:text-foreground" onClick={markAll}>
            Marcar como lidas
          </button>
        </div>
        <div className="max-h-80 overflow-y-auto">
          {items.length === 0 && (
            <p className="px-3 py-8 text-center text-[13px] text-muted-foreground">Nenhuma notificação.</p>
          )}
          {items.map((item) => (
            <div
              key={item.id}
              className={cn("border-b px-3 py-2.5 last:border-b-0", !item.readAt && "bg-muted/40")}
            >
              <p className="text-[13px] font-medium">{item.title}</p>
              <p className="text-[12px] text-muted-foreground">{item.body}</p>
              <p className="mt-1 text-[11px] text-muted-foreground">{fromNow(item.createdAt)}</p>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
