import Link from "next/link";
import { prisma } from "@/lib/db/prisma";
import { Button } from "@/components/ui/button";
import { CompetitionStatusBadge } from "@/components/competitions/status-badge";
import { formatBrlFromCents } from "@/lib/competitions/prizes";

export const metadata = { title: "Admin campeonatos" };

export default async function AdminCompetitionsPage() {
  const items = await prisma.competition.findMany({ orderBy: { createdAt: "desc" }, take: 50 });
  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-[18px] font-semibold">Campeonatos</h1>
        <Button asChild>
          <Link href="/admin/competitions/new">Novo</Link>
        </Button>
      </div>
      <div className="space-y-2">
        {items.map((item) => (
          <Link key={item.id} href={`/admin/competitions/${item.id}`} className="flex items-center justify-between rounded-xl border bg-card px-3 py-3">
            <span>
              <span className="font-medium">{item.name}</span>
              <span className="ml-2 text-[12px] text-muted-foreground">{formatBrlFromCents(item.prizePoolCents)}</span>
            </span>
            <CompetitionStatusBadge status={item.status} />
          </Link>
        ))}
      </div>
    </div>
  );
}
