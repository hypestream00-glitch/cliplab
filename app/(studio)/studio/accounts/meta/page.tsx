import { requireWorkspaceContext } from "@/lib/auth/session";
import { readMetaPending } from "@/lib/social/meta/pending";
import { PageHeader } from "@/components/dashboard/primitives";
import { Button } from "@/components/ui/button";
import { confirmMetaAccountsAction } from "@/app/(studio)/studio/accounts/meta/actions";
import type { PageSearchProps } from "@/types/routes";
import Link from "next/link";

export const metadata = { title: "Conectar Meta" };

export default async function MetaSelectPage({ searchParams }: PageSearchProps) {
  const ctx = await requireWorkspaceContext();
  const query = await searchParams;
  const pendingId = typeof query.pending === "string" ? query.pending : "";
  const pending = pendingId ? await readMetaPending({ id: pendingId, workspaceId: ctx.workspace.id, userId: ctx.user.id }) : null;

  if (!pending) {
    return (
      <div>
        <PageHeader title="Conectar Meta" description="A seleção expirou. Conecte de novo." />
        <Button asChild>
          <Link href="/studio/accounts">Voltar às contas</Link>
        </Button>
      </div>
    );
  }

  const intent = pending.row.intent;
  const pages =
    intent === "INSTAGRAM"
      ? pending.discovery.pages.filter((page) => page.instagram)
      : pending.discovery.pages;

  return (
    <div className="max-w-2xl">
      <PageHeader
        title={intent === "INSTAGRAM" ? "Escolher Instagram" : "Escolher Páginas do Facebook"}
        description="CLIPLAB não conecta automaticamente todas as páginas. Marque somente o que deseja publicar."
      />
      {pages.length === 0 ? (
        <p className="text-[13px] text-amber-200">
          {intent === "INSTAGRAM"
            ? "Nenhuma conta Instagram profissional vinculada a uma Página foi encontrada. A Graph API com Facebook Login exige Business/Creator ligada a uma Page."
            : "Nenhuma Página administrada foi encontrada para este usuário."}
        </p>
      ) : (
        <form action={confirmMetaAccountsAction} className="space-y-3">
          <input type="hidden" name="pendingId" value={pending.row.id} />
          {pages.map((page) => {
            const ig = page.instagram;
            const value = intent === "INSTAGRAM" ? `ig:${page.id}` : `page:${page.id}`;
            return (
              <label key={value} className="flex items-start gap-3 rounded-lg border bg-card p-3 text-[13px]">
                <input type="checkbox" name="selections" value={value} className="mt-1" defaultChecked={pages.length === 1} />
                <div>
                  <p className="font-medium">{intent === "INSTAGRAM" ? `@${ig?.username}` : page.name}</p>
                  <p className="text-[12px] text-muted-foreground">
                    {intent === "INSTAGRAM"
                      ? `${ig?.name ?? ""} · Página ${page.name}${ig?.accountType ? ` · ${ig.accountType}` : ""}`
                      : `Página ${page.id}${page.canCreateContent ? "" : " · sem CREATE_CONTENT"}`}
                  </p>
                </div>
              </label>
            );
          })}
          <Button type="submit">Conectar selecionadas</Button>
        </form>
      )}
    </div>
  );
}
