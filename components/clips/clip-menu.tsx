"use client";

import Link from "next/link";
import { MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  archiveClipAction,
  deleteClipAction,
  downloadClipAction,
  duplicateClipAction,
} from "@/app/(studio)/studio/clips/actions";

function ActionItem({
  action,
  clipId,
  label,
  destructive,
  confirm,
}: {
  action: (formData: FormData) => Promise<void>;
  clipId: string;
  label: string;
  destructive?: boolean;
  confirm?: string;
}) {
  return (
    <form action={action}>
      <input type="hidden" name="clipId" value={clipId} />
      <DropdownMenuItem
        variant={destructive ? "destructive" : "default"}
        onSelect={(event) => {
          event.preventDefault();
          if (confirm && !window.confirm(confirm)) return;
          const form = (event.target as HTMLElement | null)?.closest("form");
          form?.requestSubmit();
        }}
      >
        {label}
      </DropdownMenuItem>
    </form>
  );
}

export function ClipMenu({ id }: { id: string }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-xs" aria-label="Ações do clipe">
          <MoreHorizontal className="size-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem asChild>
          <Link href={`/studio/editor/${id}`}>Editar</Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href={`/studio/publishing?clip=${id}`}>Publicar</Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href={`/studio/publishing?clip=${id}&mode=schedule`}>Agendar</Link>
        </DropdownMenuItem>
        <ActionItem action={downloadClipAction} clipId={id} label="Download" />
        <ActionItem action={duplicateClipAction} clipId={id} label="Duplicar" />
        <ActionItem action={archiveClipAction} clipId={id} label="Arquivar" />
        <DropdownMenuSeparator />
        <ActionItem action={deleteClipAction} clipId={id} label="Excluir" destructive confirm="Excluir este clipe? Esta ação não pode ser desfeita." />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
