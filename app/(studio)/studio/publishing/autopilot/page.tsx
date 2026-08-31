import { requireWorkspaceContext } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { PageHeader, StatusBadge } from "@/components/dashboard/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createAutopilotRuleAction, toggleAutopilotRuleAction, runAutopilotNowAction } from "@/app/(studio)/studio/publishing/autopilot/actions";
import type { PageSearchProps } from "@/types/routes";

export const metadata = { title: "Autopilot" };

export default async function AutopilotPage({ searchParams }: PageSearchProps) {
  const { workspace } = await requireWorkspaceContext();
  const params = await searchParams;
  const error = typeof params.error === "string" ? params.error : "";
  const rules = await prisma.autopilotRule.findMany({
    where: { workspaceId: workspace.id },
    orderBy: { createdAt: "desc" },
  });
  const destinationAccounts = await prisma.socialAccount.findMany({
    where: { workspaceId: workspace.id, platform: { in: ["TIKTOK", "INSTAGRAM", "FACEBOOK", "X", "YOUTUBE"] }, mock: false },
    orderBy: [{ platform: "asc" }, { username: "asc" }],
  });

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Autopilot"
        description="Regras só publicam com consentimento explícito. O interruptor permanece desligado até você ativar."
      />
      {error === "consent" ? (
        <p className="mb-4 rounded-lg border border-destructive/40 px-3 py-2 text-[13px] text-destructive">
          Confirme o consentimento para criar a regra.
        </p>
      ) : null}
      {error === "disabled" ? (
        <p className="mb-4 rounded-lg border border-destructive/40 px-3 py-2 text-[13px] text-destructive">
          Nenhuma regra ligada com consentimento. Crie e ative uma regra antes de rodar.
        </p>
      ) : null}
      {error === "empty" ? (
        <p className="mb-4 rounded-lg border px-3 py-2 text-[13px] text-muted-foreground">
          Nenhuma publicação gerada. Verifique contas conectadas, score mínimo e clipes READY ainda não publicados.
        </p>
      ) : null}
      <form action={createAutopilotRuleAction} className="mb-8 space-y-3 rounded-xl border bg-card p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="name">Nome</Label>
            <Input id="name" name="name" required placeholder="Melhores clipes para TikTok" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="source">Origem</Label>
            <select id="source" name="source" className="h-8 w-full rounded-md border bg-transparent px-2 text-[13px]">
              <option value="READY_CLIPS">Clipes prontos</option>
              <option value="LIVE">Live</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="destinations">Destino</Label>
            <select id="destinations" name="destinations" className="h-8 w-full rounded-md border bg-transparent px-2 text-[13px]">
              <option value="TIKTOK">TikTok</option>
              <option value="INSTAGRAM">Instagram</option>
              <option value="FACEBOOK">Facebook</option>
              <option value="X">X</option>
              <option value="YOUTUBE">YouTube</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="socialAccountId">Conta</Label>
            <select id="socialAccountId" name="socialAccountId" className="h-8 w-full rounded-md border bg-transparent px-2 text-[13px]">
              <option value="">Qualquer conta do destino</option>
              {destinationAccounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.platform} · @{account.username}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="minimumScore">Score mínimo</Label>
            <Input id="minimumScore" name="minimumScore" type="number" defaultValue={85} min={0} max={100} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="maxPostsPerDay">Máx. posts / dia</Label>
            <Input id="maxPostsPerDay" name="maxPostsPerDay" type="number" defaultValue={3} min={1} max={20} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="captionPrompt">Prompt de legenda</Label>
            <Input id="captionPrompt" name="captionPrompt" placeholder="Tom direto, CTA no final" />
          </div>
        </div>
        <label className="flex items-start gap-2 rounded-md border px-3 py-2 text-[13px]">
          <input type="checkbox" name="consentGiven" required className="mt-0.5" />
          Autorizo publicações automáticas desta regra. Nada será publicado até eu ativar o interruptor.
        </label>
        <Button type="submit">Criar regra (desligada)</Button>
      </form>

      <form action={runAutopilotNowAction} className="mb-4">
        <Button type="submit" variant="outline">
          Rodar regras ligadas
        </Button>
      </form>

      <div className="space-y-2">
        {rules.map((rule) => (
          <article key={rule.id} className="flex items-center justify-between rounded-xl border px-3 py-3">
            <div>
              <p className="text-[13px] font-medium">{rule.name}</p>
              <p className="text-[12px] text-muted-foreground">
                {rule.source} · score ≥ {rule.minimumScore} · {rule.maxPostsPerDay}/dia
              </p>
            </div>
            <div className="flex items-center gap-2">
              <StatusBadge status={rule.enabled ? "READY" : "DRAFT"} />
              <form action={toggleAutopilotRuleAction}>
                <input type="hidden" name="id" value={rule.id} />
                <Button size="sm" variant="outline" type="submit">
                  {rule.enabled ? "Desligar" : "Ligar"}
                </Button>
              </form>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
