import { adminCreateCompetitionAction } from "@/app/admin/competitions/actions";
import { Button } from "@/components/ui/button";
import { PrizeRulesEditor } from "@/components/competitions/prize-rules-editor";
import type { PageSearchProps } from "@/types/routes";

export const metadata = { title: "Novo campeonato" };

export default async function AdminNewCompetitionPage({ searchParams }: PageSearchProps) {
  const params = await searchParams;
  const error = typeof params.error === "string" ? params.error : null;
  return (
    <form action={adminCreateCompetitionAction} className="max-w-xl space-y-3">
      <h1 className="text-[18px] font-semibold">Novo campeonato</h1>
      {error ? <p className="text-[13px] text-destructive">{error}</p> : null}
      <label className="block text-[13px]">Nome<input required name="name" className="mt-1 h-10 w-full rounded-md border bg-transparent px-2" /></label>
      <label className="block text-[13px]">Descrição<textarea name="description" className="mt-1 h-24 w-full rounded-md border bg-transparent px-2 py-2" /></label>
      <label className="block text-[13px]">Banner URL<input name="bannerUrl" className="mt-1 h-10 w-full rounded-md border bg-transparent px-2" /></label>
      <PrizeRulesEditor />
      <label className="block text-[13px]">Views por unidade<input name="viewsPerUnit" defaultValue="1000" className="mt-1 h-10 w-full rounded-md border bg-transparent px-2" /></label>
      <label className="block text-[13px]">R$ por unidade<input name="amountPerUnit" defaultValue="1" className="mt-1 h-10 w-full rounded-md border bg-transparent px-2" /></label>
      <label className="block text-[13px]">Faixas de views (views:R$) <input name="viewsTiers" placeholder="100000:50,500000:300" className="mt-1 h-10 w-full rounded-md border bg-transparent px-2" /></label>
      <label className="block text-[13px]">Início<input required type="datetime-local" name="startsAt" className="mt-1 h-10 w-full rounded-md border bg-transparent px-2" /></label>
      <label className="block text-[13px]">Fim<input required type="datetime-local" name="endsAt" className="mt-1 h-10 w-full rounded-md border bg-transparent px-2" /></label>
      <fieldset className="space-y-1 text-[13px]">
        <legend>Plataformas</legend>
        {["TIKTOK", "INSTAGRAM", "YOUTUBE"].map((item) => (
          <label key={item} className="flex items-center gap-2">
            <input type="checkbox" name="platforms" value={item} defaultChecked />
            {item}
          </label>
        ))}
      </fieldset>
      <label className="block text-[13px]">Máx. clips<input name="maxClips" type="number" defaultValue={20} className="mt-1 h-10 w-full rounded-md border bg-transparent px-2" /></label>
      <label className="block text-[13px]">Regras<textarea name="rules" className="mt-1 h-24 w-full rounded-md border bg-transparent px-2 py-2" /></label>
      <label className="block text-[13px]">Hashtags obrigatórias<input name="requiredHashtags" placeholder="#mugao" className="mt-1 h-10 w-full rounded-md border bg-transparent px-2" /></label>
      <label className="block text-[13px]">Texto obrigatório<input name="requiredText" className="mt-1 h-10 w-full rounded-md border bg-transparent px-2" /></label>
      <label className="block text-[13px]">
        Status
        <select name="status" className="mt-1 h-10 w-full rounded-md border bg-transparent px-2">
          <option value="DRAFT">Rascunho</option>
          <option value="SCHEDULED">Agendado</option>
          <option value="ACTIVE">Ativo</option>
        </select>
      </label>
      <Button type="submit">Criar campeonato</Button>
    </form>
  );
}
