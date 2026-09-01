import { requireWorkspaceContext } from "@/lib/auth/session";
import { listBrandKits } from "@/lib/services/brand-kit";
import { PageHeader, EmptyState } from "@/components/dashboard/primitives";
import { createBrandKitAction, deleteBrandKitAction, updateBrandKitAction } from "@/app/(studio)/studio/brand-kit/actions";
import type { PageSearchProps } from "@/types/routes";

export const metadata = { title: "Brand Kit" };

export default async function BrandKitPage({ searchParams }: PageSearchProps) {
  const { workspace } = await requireWorkspaceContext();
  const params = await searchParams;
  const error = typeof params.error === "string" ? params.error : "";
  const kits = await listBrandKits(workspace.id);
  return (
    <div className="space-y-6">
      <PageHeader
        title="Brand Kit"
        description="Logos, cores e watermark aplicados aos clips deste workspace."
      />
      {error ? <p className="text-[13px] text-destructive">{error}</p> : null}
      <form action={createBrandKitAction} className="grid gap-3 rounded-2xl border border-border bg-card p-4 sm:grid-cols-2">
        <input name="name" required placeholder="Nome do kit" className="h-10 rounded-xl border border-border bg-transparent px-3 text-[13px]" />
        <input name="watermark" placeholder="Texto da watermark / @usuario" className="h-10 rounded-xl border border-border bg-transparent px-3 text-[13px]" />
        <label className="text-[12px] text-muted-foreground">
          Cor principal
          <input name="primaryColor" type="color" defaultValue="#E92ACB" className="mt-1 h-10 w-full rounded-xl border border-border bg-transparent" />
        </label>
        <label className="text-[12px] text-muted-foreground">
          Cor secundária
          <input name="secondaryColor" type="color" defaultValue="#8B3DFF" className="mt-1 h-10 w-full rounded-xl border border-border bg-transparent" />
        </label>
        <input name="fonts" placeholder="Fontes, separadas por vírgula" className="h-10 rounded-xl border border-border bg-transparent px-3 text-[13px] sm:col-span-2" />
        <input name="captionPreset" placeholder="Posição padrão das legendas (ex.: bottom)" className="h-10 rounded-xl border border-border bg-transparent px-3 text-[13px] sm:col-span-2" />
        <button type="submit" className="h-10 rounded-xl gradient-brand px-4 text-[13px] font-semibold text-white sm:col-span-2">
          Criar Brand Kit
        </button>
      </form>
      {kits.length === 0 ? (
        <EmptyState title="Nenhum Brand Kit." description="Crie um kit para padronizar cores, watermark e legendas dos clips." />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {kits.map((kit) => (
            <article key={kit.id} className="rounded-2xl border border-border bg-card p-4">
              <div className="mb-3 flex h-16 overflow-hidden rounded-xl">
                <span className="flex-1" style={{ background: kit.primaryColor }} />
                <span className="flex-1" style={{ background: kit.secondaryColor }} />
              </div>
              <form action={updateBrandKitAction} className="space-y-2">
                <input type="hidden" name="id" value={kit.id} />
                <input name="name" defaultValue={kit.name} className="h-9 w-full rounded-xl border border-border bg-transparent px-3 text-[13px]" />
                <input name="watermark" defaultValue={kit.watermark ?? ""} className="h-9 w-full rounded-xl border border-border bg-transparent px-3 text-[13px]" />
                <div className="grid grid-cols-2 gap-2">
                  <input name="primaryColor" type="color" defaultValue={kit.primaryColor} className="h-9 w-full rounded-xl border border-border" />
                  <input name="secondaryColor" type="color" defaultValue={kit.secondaryColor} className="h-9 w-full rounded-xl border border-border" />
                </div>
                <input name="fonts" defaultValue={kit.fonts.join(", ")} className="h-9 w-full rounded-xl border border-border bg-transparent px-3 text-[13px]" />
                <input name="captionPreset" defaultValue={kit.captionPreset ?? ""} className="h-9 w-full rounded-xl border border-border bg-transparent px-3 text-[13px]" />
                <button type="submit" className="h-9 w-full rounded-xl border border-border text-[13px]">
                  Salvar
                </button>
              </form>
              <form action={deleteBrandKitAction} className="mt-2">
                <input type="hidden" name="id" value={kit.id} />
                <button type="submit" className="text-[12px] text-destructive">
                  Excluir
                </button>
              </form>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
