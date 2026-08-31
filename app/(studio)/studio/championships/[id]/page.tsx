import { notFound } from "next/navigation";
import { requireWorkspaceContext } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { StatusBadge } from "@/components/dashboard/primitives";
import { Button } from "@/components/ui/button";
import {
  joinChampionshipAction,
  openChampionshipAction,
  submitClipToChampionshipAction,
} from "@/app/(studio)/studio/championships/actions";
import type { PageParamsProps } from "@/types/routes";
import { visibleClipLibraryWhere } from "@/lib/data/visibility";

export default async function ChampionshipDetailPage({ params }: PageParamsProps<{ id: string }>) {
  const { workspace, user } = await requireWorkspaceContext();
  const { id } = await params;
  const [championship, clips] = await Promise.all([
    prisma.championship.findFirst({
      where: { id, workspaceId: workspace.id },
      include: { participants: true, submissions: { include: { clip: true, user: true } } },
    }),
    prisma.clip.findMany({
      where: { ...visibleClipLibraryWhere(workspace.id), status: { not: "ARCHIVED" } },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
  ]);
  if (!championship) notFound();
  const leaderboard = [...championship.submissions].sort((a, b) => b.score - a.score);
  const joined = championship.participants.some((item) => item.userId === user.id);
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[18px] font-semibold">{championship.title}</h1>
        <div className="flex items-center gap-2">
          <StatusBadge status={championship.status} />
          {championship.status === "DRAFT" ? (
            <form action={openChampionshipAction}>
              <input type="hidden" name="championshipId" value={championship.id} />
              <Button size="sm" type="submit">
                Abrir inscrições
              </Button>
            </form>
          ) : null}
          {!joined ? (
            <form action={joinChampionshipAction}>
              <input type="hidden" name="championshipId" value={championship.id} />
              <Button size="sm" variant="outline" type="submit">
                Participar
              </Button>
            </form>
          ) : null}
        </div>
      </div>
      <div className="mb-4 grid grid-cols-4 gap-3 text-[13px]">
        <div className="rounded-lg border p-3">Participantes {championship.participants.length}</div>
        <div className="rounded-lg border p-3">Clipes {championship.submissions.length}</div>
        <div className="rounded-lg border p-3">Premiação {championship.prize ?? "—"}</div>
        <div className="rounded-lg border p-3">Views {championship.submissions.reduce((sum, item) => sum + item.views, 0)}</div>
      </div>
      {joined ? (
        <form action={submitClipToChampionshipAction} className="mb-6 flex max-w-lg gap-2">
          <input type="hidden" name="championshipId" value={championship.id} />
          <select name="clipId" required className="h-8 flex-1 rounded-md border bg-transparent px-2 text-[13px]">
            <option value="">Enviar clipe</option>
            {clips.map((clip) => (
              <option key={clip.id} value={clip.id}>
                {clip.title}
              </option>
            ))}
          </select>
          <Button size="sm" type="submit" disabled={clips.length === 0}>
            Submeter
          </Button>
        </form>
      ) : (
        <p className="mb-4 text-[13px] text-muted-foreground">Participe para enviar clipes ao ranking.</p>
      )}
      <table className="w-full text-left text-[13px]">
        <thead className="border-b text-[11px] text-muted-foreground">
          <tr>
            <th className="py-2">Posição</th>
            <th>Clipe</th>
            <th>Usuário</th>
            <th>Views</th>
            <th>Score</th>
          </tr>
        </thead>
        <tbody>
          {leaderboard.length === 0 ? (
            <tr>
              <td className="py-4 text-muted-foreground" colSpan={5}>
                Nenhuma submissão ainda.
              </td>
            </tr>
          ) : (
            leaderboard.map((row, index) => (
              <tr key={row.id} className="border-b">
                <td className="py-2">{index + 1}</td>
                <td>{row.clip.title}</td>
                <td>{row.user.name ?? row.user.email}</td>
                <td>{row.views}</td>
                <td>{row.score}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
