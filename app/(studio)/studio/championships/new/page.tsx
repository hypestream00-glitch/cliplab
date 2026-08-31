import { PageHeader } from "@/components/dashboard/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createChampionshipAction } from "@/app/(studio)/studio/championships/actions";

export const metadata = { title: "Novo campeonato" };

export default function NewChampionshipPage() {
  return (
    <div className="max-w-xl">
      <PageHeader title="Novo campeonato" />
      <form action={createChampionshipAction} className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="title">Título</Label>
          <Input id="title" name="title" required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="description">Descrição</Label>
          <Textarea id="description" name="description" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="startAt">Início</Label>
            <Input id="startAt" name="startAt" type="datetime-local" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="endAt">Término</Label>
            <Input id="endAt" name="endAt" type="datetime-local" required />
          </div>
        </div>
        <Button type="submit">Criar</Button>
      </form>
    </div>
  );
}
