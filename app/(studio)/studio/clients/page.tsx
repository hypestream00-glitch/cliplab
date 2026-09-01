import { requireWorkspaceContext } from "@/lib/auth/session";
import { listClients } from "@/lib/services/clients";
import { listBrandKits } from "@/lib/services/brand-kit";
import { PageHeader, EmptyState } from "@/components/dashboard/primitives";
import { createClientAction, deleteClientAction } from "@/app/(studio)/studio/clients/actions";
import type { PageSearchProps } from "@/types/routes";

export const metadata = { title: "Clientes" };

export default async function ClientsPage({ searchParams }: PageSearchProps) {
  const { workspace } = await requireWorkspaceContext();
  const params = await searchParams;
  const error = typeof params.error === "string" ? params.error : "";
  const [clients, kits] = await Promise.all([listClients(workspace.id), listBrandKits(workspace.id)]);
  return (
    <div className="space-y-6">
      <PageHeader title="Clientes" description="Separe projetos, contas sociais e Brand Kits por cliente da agência." />
      {error ? <p className="text-[13px] text-destructive">{error}</p> : null}
      <form action={createClientAction} className="flex flex-wrap gap-2 rounded-2xl border border-border bg-card p-4">
        <input name="name" required placeholder="Nome do cliente" className="h-10 min-w-[200px] flex-1 rounded-xl border border-border bg-transparent px-3 text-[13px]" />
        <select name="brandKitId" className="h-10 rounded-xl border border-border bg-transparent px-3 text-[13px]">
          <option value="">Sem Brand Kit</option>
          {kits.map((kit) => (
            <option key={kit.id} value={kit.id}>
              {kit.name}
            </option>
          ))}
        </select>
        <button type="submit" className="h-10 rounded-xl gradient-brand px-4 text-[13px] font-semibold text-white">
          Adicionar cliente
        </button>
      </form>
      {clients.length === 0 ? (
        <EmptyState title="Nenhum cliente." description="Use esta área para separar assets e contas de cada cliente. Nada é misturado entre clientes." />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {clients.map((client) => (
            <article key={client.id} className="rounded-2xl border border-border bg-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-[15px] font-semibold">{client.name}</h2>
                  <p className="mt-1 text-[12px] text-muted-foreground">
                    {client._count.projects} projetos · {client._count.socialAccounts} contas
                    {client.brandKit ? ` · ${client.brandKit.name}` : ""}
                  </p>
                </div>
                <form action={deleteClientAction}>
                  <input type="hidden" name="id" value={client.id} />
                  <button type="submit" className="text-[12px] text-destructive">
                    Remover
                  </button>
                </form>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
