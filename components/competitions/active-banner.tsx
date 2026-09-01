import Link from "next/link";
import { Trophy } from "lucide-react";
import { formatBrlFromCents } from "@/lib/competitions/prizes";

export function ActiveCompetitionBanner({
  name,
  slug,
  prizePoolCents,
}: {
  name: string;
  slug: string;
  prizePoolCents: number;
}) {
  return (
    <article className="mb-4 overflow-hidden rounded-2xl border border-yellow-500/30 bg-black p-4 glow-promo">
      <p className="text-[11px] font-semibold tracking-wide text-yellow-400 uppercase">Em jogo {formatBrlFromCents(prizePoolCents)}</p>
      <h2 className="mt-1 text-[18px] font-semibold text-white">{name}</h2>
      <p className="mt-1 text-[13px] text-zinc-400">Crie clips, publique e dispute o ranking.</p>
      <Link
        href={`/studio/competitions/${slug}`}
        className="mt-3 inline-flex h-9 items-center gap-1.5 rounded-lg gradient-brand px-3 text-[13px] font-semibold text-white"
      >
        <Trophy className="size-3.5" />
        Ver campeonato
      </Link>
    </article>
  );
}
