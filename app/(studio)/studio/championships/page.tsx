import Link from "next/link";
import { requireWorkspaceContext } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { EmptyState, PageHeader, StatusBadge } from "@/components/dashboard/primitives";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Campeonatos" };

export default async function ChampionshipsPage() {
  const { workspace } = await requireWorkspaceContext();
  const items = await prisma.championship.findMany({ where: { workspaceId: workspace.id }, orderBy: { startAt: "desc" } });
  return (
    <div>
      <PageHeader
        title="Campeonatos"
        actions={
          <Button asChild>
            <Link href="/studio/championships/new">Novo</Link>
          </Button>
        }
      />
      {items.length === 0 ? (
        <EmptyState
          title="Nenhum campeonato ainda."
          description="Crie um campeonato para reunir clipes, participantes e um ranking."
          actionLabel="Novo campeonato"
          actionHref="/studio/championships/new"
        />
      ) : (
      <div className="grid gap-3 md:grid-cols-2">
        {items.map((item) => (
          <Link key={item.id} href={`/studio/championships/${item.id}`} className="rounded-lg border p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-[14px] font-semibold">{item.title}</h2>
              <StatusBadge status={item.status} />
            </div>
            <p className="mt-1 text-[13px] text-muted-foreground">{item.description}</p>
          </Link>
        ))}
      </div>
      )}
    </div>
  );
}
