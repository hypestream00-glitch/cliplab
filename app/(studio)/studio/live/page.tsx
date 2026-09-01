import { requireWorkspaceContext } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { PageHeader, StatusBadge, EmptyState } from "@/components/dashboard/primitives";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { createLiveChannelAction } from "@/app/(studio)/studio/live/actions";
import { Input } from "@/components/ui/input";
import { visibleLiveChannelWhere } from "@/lib/data/visibility";
import { getPlanLimits } from "@/lib/config/plans";
import { getWorkspacePlanCode } from "@/lib/billing/usage";
import { isFeatureEnabled } from "@/lib/features/flags";
import { envPresent } from "@/lib/env/status";
import type { PageSearchProps } from "@/types/routes";

export const metadata = { title: "Clipping ao vivo" };

export default async function LivePage({ searchParams }: PageSearchProps) {
  const { workspace } = await requireWorkspaceContext();
  const params = await searchParams;
  const error = typeof params.error === "string" ? params.error : "";
  const channels = await prisma.liveChannel.findMany({ where: visibleLiveChannelWhere(workspace.id) });
  const plan = getPlanLimits(await getWorkspacePlanCode(workspace.id));
  const featureOn = isFeatureEnabled("ENABLE_LIVE_CLIPPING");
  const allowed = featureOn && plan.liveClipping;
  const twitchReady = envPresent("TWITCH_CLIENT_ID") && envPresent("TWITCH_CLIENT_SECRET");
  return (
    <div>
      <PageHeader
        title="Clipping ao vivo"
        description="Cadastre um canal autorizado. O CortaClip consulta o status da live quando a API oficial estiver configurada. Corte automático de vídeo exige ingestão autorizada e ainda não baixa a transmissão."
        actions={
          <Button asChild variant="outline">
            <Link href="/studio/live/channels">Canais</Link>
          </Button>
        }
      />
      {error ? <p className="mb-3 text-[13px] text-destructive">{error === "platform" ? "Plataforma inválida." : error}</p> : null}
      <div className="mb-4 space-y-2 rounded-2xl border border-border bg-card p-4 text-[13px] text-muted-foreground">
        <p>
          Twitch: {twitchReady ? "status ao vivo via Helix quando o monitoramento está ativo." : "credenciais Helix ausentes — o canal fica registrado, sem status real."}
        </p>
        <p>Kick e YouTube: cadastro e regras salvos. Status oficial de live ainda não está disponível nestas APIs neste produto.</p>
        <p>Auto-publicação permanece desligada até consentimento explícito. Nenhum clip é gerado automaticamente a partir da live nesta versão.</p>
      </div>
      {!allowed ? (
        <p className="mb-4 text-[13px] text-muted-foreground">
          {!featureOn
            ? "Clipping ao vivo está desativado neste ambiente."
            : "Clipping ao vivo está disponível no plano Pro."}{" "}
          <Link href="/studio/settings/billing" className="text-primary">
            Ver plano
          </Link>
        </p>
      ) : (
        <form action={createLiveChannelAction} className="mb-6 grid max-w-2xl gap-2 rounded-2xl border border-border bg-card p-4 sm:grid-cols-2">
          <select name="platform" className="h-10 rounded-xl border border-border bg-transparent px-3 text-[13px]">
            <option value="TWITCH">Twitch</option>
            <option value="KICK">Kick</option>
            <option value="YOUTUBE">YouTube</option>
          </select>
          <Input name="username" required placeholder="Canal ou URL" className="h-10" />
          <Input name="clipEveryMinutes" type="number" min={1} defaultValue={10} className="h-10" aria-label="Intervalo em minutos" />
          <Input name="clipDuration" type="number" min={10} defaultValue={45} className="h-10" aria-label="Duração do clip" />
          <Input name="minimumScore" type="number" min={0} max={100} defaultValue={70} className="h-10" aria-label="Viral score mínimo" />
          <label className="flex items-center gap-2 text-[13px] text-muted-foreground">
            <input type="checkbox" name="autoCaption" defaultChecked />
            Legendas automáticas
          </label>
          <Button type="submit" className="sm:col-span-2">
            Adicionar transmissão
          </Button>
        </form>
      )}
      {channels.length === 0 ? (
        <EmptyState title="Nenhuma transmissão cadastrada." description="Adicione um canal autorizado para acompanhar o status da live." />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {channels.map((channel) => (
            <Link key={channel.id} href={`/studio/live/${channel.id}`} className="rounded-lg border bg-card p-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[13px] font-semibold">@{channel.username}</p>
                  <p className="text-[12px] text-muted-foreground">{channel.platform}</p>
                </div>
                <StatusBadge status={channel.status} />
              </div>
              <p className="mt-3 text-[12px] text-muted-foreground">
                {channel.monitoringEnabled ? "Monitorando" : "Aguardando"} · auto publish {channel.autoPublish ? "on" : "off"}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
