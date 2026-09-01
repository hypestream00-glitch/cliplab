import { requireWorkspaceContext } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { PageHeader } from "@/components/dashboard/primitives";
import { formatDateTime } from "@/lib/utils/format";
import { ChangePasswordForm } from "@/components/settings/change-password-form";
import { DevNotice } from "@/components/dashboard/dev-notice";
import type { PageSearchProps } from "@/types/routes";

export default async function SecurityPage({ searchParams }: PageSearchProps) {
  const { user } = await requireWorkspaceContext();
  const params = await searchParams;
  const saved = params.saved === "1";
  const history = await prisma.loginHistory.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 12,
  });
  return (
    <div>
      <PageHeader title="Segurança" description="Sessões e senha da conta CortaClip." />
      <div className="mb-4">
        <DevNotice>2FA não está disponível nesta versão. CortaClip não finge autenticação em dois fatores.</DevNotice>
      </div>
      <div className="mb-6">
        <ChangePasswordForm
          redirectTo="/studio/settings/security"
          saved={saved}
          error={typeof params.error === "string" ? params.error : undefined}
        />
      </div>
      <h2 className="mb-2 text-[13px] font-semibold">Histórico de login</h2>
      <div className="divide-y rounded-lg border text-[13px]">
        {history.length === 0 ? (
          <p className="px-3 py-4 text-muted-foreground">Nenhum login registrado ainda.</p>
        ) : (
          history.map((item) => (
            <div key={item.id} className="flex justify-between px-3 py-2">
              <span>{item.success ? "OK" : "Falha"}</span>
              <span className="text-muted-foreground">{formatDateTime(item.createdAt)}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
