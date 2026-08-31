import { requireWorkspaceContext } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { PageHeader } from "@/components/dashboard/primitives";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { deleteWorkspaceAction, updateWorkspaceAction } from "@/app/(studio)/studio/settings/actions";
import type { PageSearchProps } from "@/types/routes";

export default async function WorkspaceSettingsPage({ searchParams }: PageSearchProps) {
  const { workspace, role, memberships, user } = await requireWorkspaceContext();
  const params = await searchParams;
  const error = typeof params.error === "string" ? params.error : "";
  const dbUser = await prisma.user.findUnique({ where: { id: user.id }, select: { timezone: true } });
  return (
    <div>
      <PageHeader title="Workspace" description="Nome e fuso usados no calendário e no agendamento." />
      {params.saved === "1" ? <p className="mb-3 text-[12px] text-emerald-300">Workspace salvo.</p> : null}
      <form action={updateWorkspaceAction} className="max-w-md space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="name">Nome</Label>
          <Input id="name" defaultValue={workspace.name} name="name" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="timezone">Timezone</Label>
          <Input id="timezone" name="timezone" defaultValue={dbUser?.timezone ?? "America/Sao_Paulo"} />
          <p className="text-[12px] text-muted-foreground">Horários do calendário e do composer usam este fuso. Internamente o agendamento fica em UTC.</p>
        </div>
        <div className="space-y-1.5">
          <Label>Tipo</Label>
          <Input defaultValue={workspace.type} disabled />
        </div>
        <Button type="submit">Salvar</Button>
      </form>
      <form action={deleteWorkspaceAction} className="mt-6 max-w-md rounded-lg border border-destructive/40 p-3">
        <p className="text-[13px] font-medium">Danger zone</p>
        <p className="text-[12px] text-muted-foreground">
          Excluir exige digitar o nome exatamente. Não é possível apagar o último workspace.
        </p>
        {error === "name" ? <p className="mt-2 text-[12px] text-destructive">O nome não confere.</p> : null}
        {error === "last" ? <p className="mt-2 text-[12px] text-destructive">Crie outro workspace antes de excluir este.</p> : null}
        <Input name="confirmName" placeholder={workspace.name} className="mt-2" disabled={role !== "OWNER"} />
        <Button type="submit" variant="destructive" className="mt-2" disabled={role !== "OWNER" || memberships.length < 2}>
          Excluir workspace
        </Button>
      </form>
    </div>
  );
}
