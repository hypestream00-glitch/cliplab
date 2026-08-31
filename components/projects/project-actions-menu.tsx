"use client";

import { useState } from "react";
import { MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { archiveProjectAction, deleteProjectAction, restoreProjectAction, renameProjectAction } from "@/app/(studio)/studio/projects/actions";

export function ProjectActionsMenu({
  projectId,
  name,
  archived,
}: {
  projectId: string;
  name: string;
  archived?: boolean;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" aria-label="Mais ações">
          <MoreHorizontal className="size-4" />
          Mais
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {archived ? (
          <form action={restoreProjectAction}>
            <input type="hidden" name="projectId" value={projectId} />
            <DropdownMenuItem
              onSelect={(event) => {
                event.preventDefault();
                (event.target as HTMLElement).closest("form")?.requestSubmit();
              }}
            >
              Restaurar
            </DropdownMenuItem>
          </form>
        ) : (
          <form action={archiveProjectAction}>
            <input type="hidden" name="projectId" value={projectId} />
            <DropdownMenuItem
              onSelect={(event) => {
                event.preventDefault();
                (event.target as HTMLElement).closest("form")?.requestSubmit();
              }}
            >
              Arquivar
            </DropdownMenuItem>
          </form>
        )}
        <DropdownMenuSeparator />
        <form action={deleteProjectAction}>
          <input type="hidden" name="projectId" value={projectId} />
          <input type="hidden" name="confirmName" value={name} />
          <DropdownMenuItem
            variant="destructive"
            onSelect={(event) => {
              event.preventDefault();
              if (!window.confirm(`Excluir “${name}”? Esta ação não pode ser desfeita.`)) return;
              (event.target as HTMLElement).closest("form")?.requestSubmit();
            }}
          >
            Excluir
          </DropdownMenuItem>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function RenameProjectControl({ projectId, name }: { projectId: string; name: string }) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <Button size="sm" variant="outline" type="button" onClick={() => setOpen(true)}>
        Renomear
      </Button>
    );
  }
  return (
    <form action={renameProjectAction} className="flex items-center gap-2">
      <input type="hidden" name="projectId" value={projectId} />
      <input
        name="name"
        defaultValue={name}
        aria-label="Novo nome"
        className="h-8 w-48 rounded-md border bg-transparent px-2 text-[13px]"
      />
      <Button size="sm" type="submit">
        Salvar
      </Button>
      <Button size="sm" variant="ghost" type="button" onClick={() => setOpen(false)}>
        Cancelar
      </Button>
    </form>
  );
}
