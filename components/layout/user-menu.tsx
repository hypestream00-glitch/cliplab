"use client";

import Link from "next/link";
import { signOut } from "next-auth/react";
import { initials } from "@/lib/utils/format";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function UserMenu({
  name,
  email,
  image,
  workspaceName,
  planName,
}: {
  name?: string | null;
  email?: string | null;
  image?: string | null;
  workspaceName?: string | null;
  planName?: string | null;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="rounded-full outline-none ring-offset-background focus-visible:ring-2">
        <Avatar className="size-7">
          {image ? <AvatarImage src={image} alt={name ?? ""} /> : null}
          <AvatarFallback className="text-[10px]">{initials(name)}</AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>
          <div className="truncate text-[13px]">{name ?? email}</div>
          <div className="truncate text-[12px] font-normal text-muted-foreground">{email}</div>
          {workspaceName ? (
            <div className="mt-1 truncate text-[11px] font-normal text-muted-foreground">{workspaceName}</div>
          ) : null}
          {planName ? (
            <div className="truncate text-[11px] font-normal text-muted-foreground">Plano {planName}</div>
          ) : null}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/studio/settings/account">Conta</Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/studio/settings/billing">Plano e uso</Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/studio/settings">Configurações</Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => signOut({ callbackUrl: "/login" })}>Sair</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
