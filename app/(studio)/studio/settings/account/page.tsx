import Link from "next/link";
import { requireWorkspaceContext } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { PageHeader } from "@/components/dashboard/primitives";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { updateProfileAction } from "@/app/(studio)/studio/settings/actions";
import { ChangePasswordForm } from "@/components/settings/change-password-form";
import type { PageSearchProps } from "@/types/routes";
import { isSeedDisplayName } from "@/lib/auth/identity";
import { brand } from "@/lib/config/brand";

export default async function AccountSettingsPage({ searchParams }: PageSearchProps) {
  const { user } = await requireWorkspaceContext();
  const params = await searchParams;
  const dbUser = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
  const verified = Boolean(dbUser.emailVerified);
  return (
    <div>
      <PageHeader title="Conta" description="Nome, e-mail e senha desta conta." />
      {params.saved === "1" ? <p className="mb-3 text-[12px] text-emerald-300">Conta atualizada.</p> : null}
      <form action={updateProfileAction} className="max-w-md space-y-3">
        <input type="hidden" name="redirectTo" value="/studio/settings/account" />
        <div className="space-y-1.5">
          <Label htmlFor="name">Nome</Label>
          <Input id="name" defaultValue={isSeedDisplayName(dbUser.name) ? "" : (dbUser.name ?? "")} name="name" />
        </div>
        <div className="space-y-1.5">
          <Label>E-mail</Label>
          <Input defaultValue={dbUser.email} disabled />
          <p className="text-[12px] text-muted-foreground">Status: {verified ? "Verificado" : "Não verificado"}</p>
        </div>
        <Button type="submit">Salvar nome</Button>
      </form>
      {!verified ? (
        <p className="mt-4 max-w-md text-[13px] text-muted-foreground">
          Confirme seu e-mail para proteger a conta.{" "}
          <Link href="/verify-email" className="text-primary hover:underline">
            Reenviar verificação
          </Link>
        </p>
      ) : null}
      <div className="mt-8">
        <ChangePasswordForm
          redirectTo="/studio/settings/account"
          saved={params.saved === "1"}
          error={typeof params.error === "string" ? params.error : undefined}
        />
      </div>
      <section className="mt-8 max-w-md rounded-xl border border-destructive/30 p-4">
        <p className="text-[13px] font-medium">Zona de risco</p>
        <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">
          A exclusão completa da conta ainda não está disponível. Isso precisaria remover usuário, memberships, projetos,
          clips, objetos no storage, conexões sociais, analytics, notificações, tokens e a relação de billing — sem apagar
          registros fiscais no Stripe. Não há botão que finja ter apagado tudo.
        </p>
        <p className="mt-2 text-[12px] text-muted-foreground">
          Você pode excluir um workspace extra em{" "}
          <Link href="/studio/settings/workspace" className="text-primary hover:underline">
            Workspace
          </Link>
          . Para encerrar a conta, fale com {brand.supportEmail}.
        </p>
      </section>
    </div>
  );
}
