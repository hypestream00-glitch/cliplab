import { requireWorkspaceContext } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { EmptyState, PageHeader } from "@/components/dashboard/primitives";
import Link from "next/link";
import { createLiveChannelAction } from "@/app/(studio)/studio/live/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { visibleLiveChannelWhere } from "@/lib/data/visibility";

export default async function LiveChannelsPage() {
  const { workspace } = await requireWorkspaceContext();
  const channels = await prisma.liveChannel.findMany({ where: visibleLiveChannelWhere(workspace.id) });
  return (
    <div>
      <PageHeader title="Canais ao vivo" />
      <form action={createLiveChannelAction} className="mb-4 flex max-w-xl flex-wrap gap-2">
        <select name="platform" className="h-8 rounded-md border bg-transparent px-2 text-[13px]">
          <option value="TWITCH">Twitch</option>
          <option value="KICK">Kick</option>
          <option value="YOUTUBE">YouTube</option>
        </select>
        <Input name="username" required placeholder="@canal" className="h-8 w-48" />
        <Button type="submit" size="sm">
          Adicionar
        </Button>
      </form>
      {channels.length === 0 ? (
        <EmptyState title="Nenhum canal cadastrado." description="Use o formulário acima para registrar um canal." />
      ) : (
        <div className="divide-y rounded-lg border">
          {channels.map((channel) => (
            <Link key={channel.id} href={`/studio/live/${channel.id}`} className="block px-3 py-2 text-[13px] hover:bg-muted/30">
              {channel.username} · {channel.platform}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
