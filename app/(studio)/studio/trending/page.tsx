import Link from "next/link";
import { requireWorkspaceContext } from "@/lib/auth/session";
import { listTrendingItems, trendingProviderAvailability } from "@/lib/trending/query";
import { TRENDING_CATEGORIES, TRENDING_PLATFORMS } from "@/lib/competitions/platforms";
import { formatNumber, formatDate, formatDuration } from "@/lib/utils/format";
import { TrendingHeroArt } from "@/components/trending/hero-art";
import { classifyIngestUrl } from "@/lib/ingest/classify";
import type { PageSearchProps } from "@/types/routes";

export const metadata = { title: "Em alta" };

const PLATFORM_LABEL: Record<string, string> = {
  ALL: "Todos",
  YOUTUBE: "YouTube",
  TWITCH: "Twitch",
  KICK: "Kick",
  TIKTOK: "TikTok",
  INSTAGRAM: "Instagram",
};

export default async function TrendingPage({ searchParams }: PageSearchProps) {
  const { user } = await requireWorkspaceContext();
  const params = await searchParams;
  const platform = typeof params.platform === "string" ? params.platform : "ALL";
  const category = typeof params.category === "string" ? params.category : "ALL";
  const sort = typeof params.sort === "string" ? params.sort : "hot";
  const items = await listTrendingItems({ platform, category, sort });
  const availability = trendingProviderAvailability();
  const anySource = availability.YOUTUBE || availability.TWITCH;
  const isAdmin = user?.role === "SUPER_ADMIN";
  const href = (next: Record<string, string>) => {
    const search = new URLSearchParams({ platform, category, sort, ...next });
    return `/studio/trending?${search.toString()}`;
  };
  const selectedUnavailable =
    platform !== "ALL" && platform in availability && !availability[platform as keyof typeof availability];

  return (
    <div>
      <section className="relative mb-7 overflow-hidden rounded-3xl border border-magenta/25 bg-[#07070a] px-6 py-8 md:px-10">
        <span className="pointer-events-none absolute -top-28 left-8 h-64 w-64 rounded-full bg-magenta/30 blur-3xl" />
        <span className="pointer-events-none absolute -bottom-24 right-10 h-56 w-56 rounded-full bg-purple/25 blur-3xl" />
        <span className="pointer-events-none absolute top-6 right-1/3 h-36 w-36 rounded-full bg-blue/15 blur-2xl" />
        <div className="relative flex items-start justify-between gap-6">
          <div>
            <p className="text-[12px] font-semibold tracking-[0.18em] text-magenta uppercase">Agora</p>
            <h1 className="mt-2 text-[30px] leading-9 font-semibold text-white">🔥 Em alta agora</h1>
            <p className="mt-2 max-w-xl text-[15px] leading-6 text-text-secondary">
              Descubra conteúdos antes deles explodirem.
            </p>
            <p className="mt-3 text-[13px] text-text-secondary">Descubra vídeos e conteúdos com potencial para gerar clips virais.</p>
          </div>
          <TrendingHeroArt />
        </div>
      </section>

      <div className="mb-6 grid gap-4 rounded-2xl border border-border bg-card/80 p-4 lg:grid-cols-[1.4fr_1.2fr_auto] lg:items-end">
        <div>
          <p className="mb-2 text-[11px] font-semibold tracking-[0.14em] text-text-secondary uppercase">Plataforma</p>
          <div className="flex flex-wrap gap-2">
            {["ALL", ...TRENDING_PLATFORMS].map((item) => (
              <Link key={item} href={href({ platform: item })} className={`filter-chip ${platform === item ? "filter-chip-active" : ""}`}>
                {PLATFORM_LABEL[item] ?? item}
              </Link>
            ))}
          </div>
        </div>
        <div>
          <p className="mb-2 text-[11px] font-semibold tracking-[0.14em] text-text-secondary uppercase">Categoria</p>
          <div className="flex flex-wrap gap-2">
            {["ALL", ...TRENDING_CATEGORIES].map((item) => (
              <Link key={item} href={href({ category: item })} className={`filter-chip ${category === item ? "filter-chip-active" : ""}`}>
                {item === "ALL" ? "Todos" : item}
              </Link>
            ))}
          </div>
        </div>
        <div>
          <p className="mb-2 text-[11px] font-semibold tracking-[0.14em] text-text-secondary uppercase">Ordenar</p>
          <div className="flex flex-wrap gap-2">
            {[
              ["hot", "Mais quentes"],
              ["views", "Mais vistos"],
              ["fast", "Crescendo mais rápido"],
              ["recent", "Mais recentes"],
            ].map(([id, label]) => (
              <Link key={id} href={href({ sort: id })} className={`filter-chip ${sort === id ? "filter-chip-active" : ""}`}>
                {label}
                {id === "hot" ? " ▼" : ""}
              </Link>
            ))}
          </div>
        </div>
      </div>

      {selectedUnavailable ? (
        <p className="mb-6 rounded-2xl border border-gold/30 bg-gold/5 px-4 py-3 text-[13px] text-gold">Fonte ainda não disponível</p>
      ) : null}

      {items.length === 0 ? (
        <div className="relative overflow-hidden rounded-3xl border border-magenta/20 bg-[#07070a] px-6 py-8">
          <span className="pointer-events-none absolute -top-16 right-8 h-40 w-40 rounded-full bg-purple/20 blur-3xl" />
          <p className="relative text-[16px] font-semibold text-white">
            {anySource ? "Nenhum conteúdo em alta agora." : "Conecte uma fonte de tendências"}
          </p>
          <p className="relative mt-2 max-w-xl text-[14px] leading-6 text-text-secondary">
            {anySource
              ? "O CortaClip só lista itens com fonte autorizada. Tente outra plataforma ou volte em instantes."
              : isAdmin
                ? "Configure a integração do YouTube para alimentar o Em alta. Defina YOUTUBE_API_KEY no servidor."
                : "O conteúdo em alta aparece aqui quando uma fonte oficial estiver conectada."}
          </p>
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {items.map((item) => {
            const ingest = item.canonicalUrl ? classifyIngestUrl(item.canonicalUrl) : null;
            return (
              <article
                key={item.id}
                className="overflow-hidden rounded-3xl border border-border bg-card transition hover:border-magenta/40 hover:shadow-[0_0_28px_rgba(233,42,203,0.12)]"
              >
                <div className="relative aspect-video bg-muted">
                  {item.thumbnailUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.thumbnailUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-[12px] text-text-secondary">Sem thumbnail</div>
                  )}
                  <span className="absolute top-3 left-3 rounded-md border border-white/10 bg-black/70 px-2 py-0.5 text-[11px] font-medium text-white">
                    {PLATFORM_LABEL[item.platform] ?? item.platform}
                  </span>
                  {item.trendScore != null ? (
                    <span className="absolute top-3 right-3 rounded-md border border-magenta/40 bg-black/75 px-2 py-0.5 text-[12px] font-semibold text-magenta glow-primary">
                      🔥 {item.trendScore}
                    </span>
                  ) : null}
                </div>
                <div className="p-4">
                  <h2 className="line-clamp-2 text-[15px] font-semibold text-white">{item.title}</h2>
                  <p className="mt-1.5 text-[13px] text-text-secondary">{item.creatorName ?? "Criador indisponível"}</p>
                  <p className="mt-2 text-[12px] text-text-secondary">
                    {item.viewCount != null ? `${formatNumber(item.viewCount)} views` : "Views indisponíveis"}
                    {item.publishedAt ? ` · ${formatDate(item.publishedAt)}` : ""}
                    {item.durationSeconds != null ? ` · ${formatDuration(item.durationSeconds * 1000)}` : ""}
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {item.canonicalUrl ? (
                      <Link
                        href={item.canonicalUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex h-9 items-center rounded-xl border border-border px-3 text-[12px] text-white hover:bg-surface-hover"
                      >
                        Abrir original
                      </Link>
                    ) : null}
                    {item.canonicalUrl ? (
                      <Link
                        href={`/studio/create?sourceUrl=${encodeURIComponent(item.canonicalUrl)}`}
                        className={
                          ingest?.ingestSupported
                            ? "inline-flex h-9 items-center rounded-xl gradient-brand px-3 text-[12px] font-semibold text-white"
                            : "inline-flex h-9 items-center rounded-xl border border-magenta/40 px-3 text-[12px] text-white hover:bg-magenta/10"
                        }
                      >
                        ✨ Criar clips
                      </Link>
                    ) : (
                      <p className="text-[12px] text-text-secondary">Usar como referência. Importação automática desta fonte ainda não é suportada.</p>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
