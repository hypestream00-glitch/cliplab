import { requireWorkspaceContext } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { PageHeader, StatusBadge, EmptyState } from "@/components/dashboard/primitives";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { createLiveChannelAction } from "@/app/(studio)/studio/live/actions";
import { Input } from "@/components/ui/input";
import { DevNotice } from "@/components/dashboard/dev-notice";
import { visibleLiveChannelWhere } from "@/lib/data/visibility";

export const metadata = { title: "Live" };

export default async function LivePage() {
  const { workspace } = await requireWorkspaceContext();
  const channels = await prisma.liveChannel.findMany({ where: visibleLiveChannelWhere(workspace.id) });
  return (
    <div>
      <PageHeader
        title="Live"
        description="Monitore Twitch, Kick e YouTube. Autopublish permanece desligado por padrão."
        actions={
          <Button asChild variant="outline">
            <Link href="/studio/live/channels">Canais</Link>
          </Button>
        }
      />
      <div className="mb-4">
        <DevNotice>
          Sem credenciais da plataforma o monitoramento não lê lives reais. O canal fica registrado e as regras de clipagem são salvas.
        </DevNotice>
      </div>
      <form action={createLiveChannelAction} className="mb-6 flex max-w-xl flex-wrap gap-2">
        <select name="platform" className="h-8 rounded-md border bg-transparent px-2 text-[13px]">
          <option value="TWITCH">Twitch</option>
          <option value="KICK">Kick</option>
          <option value="YOUTUBE">YouTube</option>
        </select>
        <Input name="username" required placeholder="@canal" className="h-8 w-48" />
        <Button type="submit" size="sm">
          Adicionar canal
        </Button>
      </form>
      {channels.length === 0 ? (
        <EmptyState title="Nenhum canal." description="Adicione Twitch, Kick ou YouTube para configurar clipagem ao vivo." />
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
                Monitoramento {channel.monitoringEnabled ? "ativo" : "inativo"} · auto publish {channel.autoPublish ? "on" : "off"}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
