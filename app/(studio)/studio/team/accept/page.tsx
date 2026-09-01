import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { PageHeader } from "@/components/dashboard/primitives";
import { acceptInvitationAction } from "@/app/(studio)/studio/team/actions";
import type { PageSearchProps } from "@/types/routes";

export const metadata = { title: "Aceitar convite" };

export default async function AcceptInvitePage({ searchParams }: PageSearchProps) {
  const user = await requireUser();
  const params = await searchParams;
  const token = typeof params.token === "string" ? params.token : "";
  const error = typeof params.error === "string" ? params.error : "";
  const invite = token
    ? await prisma.workspaceInvitation.findUnique({
        where: { token },
        include: { workspace: true },
      })
    : null;
  const message =
    error === "email"
      ? "Este convite foi enviado para outro e-mail."
      : error === "expired"
        ? "Este convite expirou."
        : error === "invalid"
          ? "Convite inválido ou já utilizado."
          : "";
  return (
    <div>
      <PageHeader title="Aceitar convite" description="Entre no workspace com a mesma conta do e-mail convidado." />
      {message ? <p className="mb-3 text-[13px] text-destructive">{message}</p> : null}
      {!token || !invite ? (
        <p className="text-[13px] text-muted-foreground">Abra o link de convite enviado pelo dono do workspace.</p>
      ) : (
        <form action={acceptInvitationAction} className="max-w-md space-y-3 rounded-2xl border border-border bg-card p-4">
          <input type="hidden" name="token" value={token} />
          <p className="text-[14px] font-medium">{invite.workspace.name}</p>
          <p className="text-[13px] text-muted-foreground">
            Papel: {invite.role} · convite para {invite.email}
          </p>
          <p className="text-[12px] text-muted-foreground">Você está logado como {user.email}.</p>
          <button type="submit" className="h-10 rounded-xl gradient-brand px-4 text-[13px] font-semibold text-white">
            Aceitar e entrar
          </button>
        </form>
      )}
    </div>
  );
}
