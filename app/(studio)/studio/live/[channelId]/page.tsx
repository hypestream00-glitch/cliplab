import { notFound } from "next/navigation";
import { requireWorkspaceContext } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { StatusBadge } from "@/components/dashboard/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DevNotice } from "@/components/dashboard/dev-notice";
import {
  saveLiveSettingsAction,
  setLiveAutoPublishAction,
  toggleLiveMonitoringAction,
} from "@/app/(studio)/studio/live/actions";
import { formatDateTime } from "@/lib/utils/format";
import type { PageParamsProps, PageSearchProps } from "@/types/routes";

export default async function LiveChannelPage({
  params,
  searchParams,
}: PageParamsProps<{ channelId: string }> & PageSearchProps) {
  const { workspace } = await requireWorkspaceContext();
  const { channelId } = await params;
  const query = await searchParams;
  const channel = await prisma.liveChannel.findFirst({
    where: { id: channelId, workspaceId: workspace.id },
    include: { sessions: { orderBy: { startedAt: "desc" }, take: 5 } },
  });
  if (!channel) notFound();
  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-[18px] font-semibold">@{channel.username}</h1>
          <p className="text-[13px] text-muted-foreground">{channel.platform}</p>
        </div>
        <StatusBadge status={channel.status} />
      </div>
      {query.error === "consent" ? (
        <p className="mb-3 text-[12px] text-destructive">Autopublish exige consentimento explícito.</p>
      ) : null}
      <DevNotice>
        Monitoramento em desenvolvimento não conecta à API da plataforma. Ligar o interruptor só persiste a preferência.
      </DevNotice>
      <dl className="mt-4 grid grid-cols-2 gap-3 rounded-lg border p-4 text-[13px] md:grid-cols-4">
        <div>
          <dt className="text-muted-foreground">Clip a cada</dt>
          <dd>{channel.clipEveryMinutes} min</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Score mínimo</dt>
          <dd>{channel.minimumScore}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Duração</dt>
          <dd>{channel.clipDuration}s</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Autopublish</dt>
          <dd>{channel.autoPublish ? "On" : "Off"}</dd>
        </div>
      </dl>
      <div className="mt-4 flex flex-wrap gap-2">
        <form action={toggleLiveMonitoringAction}>
          <input type="hidden" name="channelId" value={channel.id} />
          <Button type="submit" variant="outline">
            {channel.monitoringEnabled ? "Pausar monitoramento" : "Ativar monitoramento"}
          </Button>
        </form>
      </div>
      <form action={saveLiveSettingsAction} className="mt-6 grid max-w-xl gap-3 rounded-xl border p-4 sm:grid-cols-3">
        <input type="hidden" name="channelId" value={channel.id} />
        <div className="space-y-1.5">
          <Label htmlFor="clipEveryMinutes">Clip a cada (min)</Label>
          <Input id="clipEveryMinutes" name="clipEveryMinutes" type="number" min={1} defaultValue={channel.clipEveryMinutes} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="minimumScore">Score mínimo</Label>
          <Input id="minimumScore" name="minimumScore" type="number" min={0} max={100} defaultValue={channel.minimumScore} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="clipDuration">Duração (s)</Label>
          <Input id="clipDuration" name="clipDuration" type="number" min={10} defaultValue={channel.clipDuration} />
        </div>
        <Button type="submit" className="sm:col-span-3">
          Salvar regras
        </Button>
      </form>
      <form action={setLiveAutoPublishAction} className="mt-4 max-w-xl space-y-2 rounded-xl border p-4">
        <input type="hidden" name="channelId" value={channel.id} />
        <input type="hidden" name="enabled" value={channel.autoPublish ? "false" : "true"} />
        {!channel.autoPublish ? (
          <label className="flex items-start gap-2 text-[13px]">
            <input type="checkbox" name="consent" required className="mt-0.5" />
            Autorizo publicação automática de clipes deste canal. Permanece desligado até eu confirmar.
          </label>
        ) : null}
        <Button type="submit" variant={channel.autoPublish ? "outline" : "default"}>
          {channel.autoPublish ? "Desligar autopublish" : "Ligar autopublish"}
        </Button>
      </form>
      <h2 className="mt-6 mb-2 text-[13px] font-semibold">Sessões</h2>
      <div className="divide-y rounded-lg border text-[13px]">
        {channel.sessions.length === 0 ? (
          <p className="px-3 py-4 text-muted-foreground">Nenhuma sessão capturada. Sem API da plataforma, a lista permanece vazia.</p>
        ) : (
          channel.sessions.map((session) => (
            <div key={session.id} className="flex justify-between px-3 py-2">
              <span>{formatDateTime(session.startedAt)}</span>
              <span className="text-muted-foreground">{session.clipsGenerated} clipes</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
