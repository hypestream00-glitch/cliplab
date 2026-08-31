"use client";

import { useRouter } from "next/navigation";
import { ChevronsUpDown, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { Workspace, WorkspaceMember } from "@/generated/prisma/client";

export function WorkspaceSwitcher({
  collapsed,
  workspaces,
  currentWorkspaceId,
}: {
  collapsed: boolean;
  workspaces: Array<WorkspaceMember & { workspace: Workspace }>;
  currentWorkspaceId: string;
}) {
  const router = useRouter();
  const current = workspaces.find((item) => item.workspaceId === currentWorkspaceId)?.workspace;

  async function select(id: string) {
    await fetch("/api/workspace/select", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspaceId: id }),
    });
    router.refresh();
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className={cn("h-9 w-full justify-between px-2 text-[13px]", collapsed && "justify-center px-0")}
        >
          <span className="flex min-w-0 items-center gap-2">
            <span className="flex size-6 items-center justify-center rounded bg-muted text-[10px] font-semibold">
              {current?.name.slice(0, 2).toUpperCase()}
            </span>
            {!collapsed && <span className="truncate">{current?.name}</span>}
          </span>
          {!collapsed && <ChevronsUpDown className="size-3.5 text-muted-foreground" />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel>Workspaces</DropdownMenuLabel>
        {workspaces.map((item) => (
          <DropdownMenuItem key={item.id} onClick={() => select(item.workspaceId)}>
            <span className="flex-1 truncate">{item.workspace.name}</span>
            {item.workspaceId === currentWorkspaceId && <Check className="size-3.5" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
