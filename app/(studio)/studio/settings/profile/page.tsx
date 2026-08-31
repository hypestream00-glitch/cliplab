import { requireWorkspaceContext } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { PageHeader } from "@/components/dashboard/primitives";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { updateProfileAction } from "@/app/(studio)/studio/settings/actions";
import type { PageSearchProps } from "@/types/routes";

export default async function ProfileSettingsPage({ searchParams }: PageSearchProps) {
  const { user } = await requireWorkspaceContext();
  const params = await searchParams;
  const dbUser = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
  return (
    <div>
      <PageHeader title="Perfil" description="Nome e preferências regionais desta conta." />
      {params.saved === "1" ? <p className="mb-3 text-[12px] text-emerald-300">Perfil salvo.</p> : null}
      <form action={updateProfileAction} className="max-w-md space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="name">Nome</Label>
          <Input id="name" defaultValue={dbUser.name ?? ""} name="name" />
        </div>
        <div className="space-y-1.5">
          <Label>E-mail</Label>
          <Input defaultValue={dbUser.email} disabled />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="language">Idioma</Label>
          <Input id="language" defaultValue={dbUser.language} name="language" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="timezone">Timezone</Label>
          <Input id="timezone" defaultValue={dbUser.timezone} name="timezone" />
        </div>
        <Button type="submit">Salvar</Button>
      </form>
    </div>
  );
}
