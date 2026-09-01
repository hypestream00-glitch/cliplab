import Link from "next/link";
import { brand } from "@/lib/config/brand";
import { Button } from "@/components/ui/button";
import { ProductPreview } from "@/components/marketing/product-preview";
import { PRODUCT_PLAN_CODES, PLAN_LIMITS } from "@/lib/config/plans";
import { planPriceLabel } from "@/lib/config/plan-commerce";
import { getSupportedPlatforms } from "@/lib/social/upload-post/platforms";
import { socialPlatformLabel } from "@/lib/social/labels";

const HOW = [
  { step: "1", title: "Envie seu vídeo", body: "Arraste um MP4, MOV ou WEBM. Arquivos grandes vão direto ao storage, sem passar pelo servidor web." },
  { step: "2", title: "IA encontra os melhores momentos", body: "Transcrição real, análise de clips e um viral score estimado a partir do conteúdo falado." },
  { step: "3", title: "Edite seus clips", body: "Ajuste cortes, legendas, formato vertical e exporte quando estiver pronto." },
  { step: "4", title: "Publique em suas redes", body: "Conecte contas, publique agora ou agende, e acompanhe status no calendário." },
];

const FEATURES = [
  { title: "AI clipping", body: "A IA seleciona janelas com gancho, clareza e potencial de compartilhamento." },
  { title: "Transcrição", body: "Whisper com timestamps de palavras quando o provedor envia." },
  { title: "Legendas automáticas", body: "Ative, edite e estilize legendas antes do render." },
  { title: "Viral score", body: "Estimativa persistida da análise. Não é garantia de performance." },
  { title: "Editor", body: "Trim, overlay, crop e aspect ratio no mesmo workspace." },
  { title: "Formatos verticais", body: "9:16, 1:1 e 16:9 para cada rede." },
  { title: "Publicação social", body: "Conexão white-label. Sem senha de rede social." },
  { title: "Agendamento", body: "Publique agora ou escolha data e hora no fuso do workspace." },
  { title: "Analytics", body: "Métricas reais do provedor. Sem números inventados." },
];

const FAQ = [
  {
    q: "Preciso de um vídeo curto para começar?",
    a: `Não. O ${brand.name} é feito para vídeos longos: lives, podcasts, aulas e entrevistas viram vários clips.`,
  },
  {
    q: "O viral score garante visualizações?",
    a: "Não. É uma estimativa da análise de IA com base no conteúdo transcrito, não uma previsão de performance.",
  },
  {
    q: "Vocês pedem senha das redes sociais?",
    a: "Nunca. A conexão usa o fluxo oficial do provedor de publicação.",
  },
  {
    q: "Posso sair enquanto o vídeo processa?",
    a: "Sim. O processamento continua no worker. Ao voltar, o estado vem do banco e da fila.",
  },
];

export default function MarketingPage() {
  const platforms = getSupportedPlatforms();
  return (
    <main>
      <section className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-16 lg:grid-cols-2 lg:py-24">
        <div>
          <p className="text-[12px] font-medium tracking-[0.16em] text-violet-300 uppercase">{brand.name}</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight md:text-5xl">
            Transforme vídeos longos em clips prontos para publicar
          </h1>
          <p className="mt-4 max-w-xl text-[16px] leading-relaxed text-muted-foreground">
            IA encontra os melhores momentos, o editor ajusta legendas e cortes, e você publica com analytics no mesmo
            workspace.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link href="/register">Começar grátis</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/#como-funciona">Ver como funciona</Link>
            </Button>
          </div>
        </div>
        <ProductPreview />
      </section>

      <section id="como-funciona" className="border-t border-white/5 bg-zinc-950/40">
        <div className="mx-auto max-w-6xl px-4 py-16">
          <h2 className="text-2xl font-semibold tracking-tight">Como funciona</h2>
          <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {HOW.map((item) => (
              <article key={item.step} className="rounded-2xl border bg-card p-5">
                <p className="text-[12px] font-semibold text-violet-300">Passo {item.step}</p>
                <h3 className="mt-2 text-[15px] font-semibold">{item.title}</h3>
                <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">{item.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="recursos" className="mx-auto max-w-6xl px-4 py-16">
        <h2 className="text-2xl font-semibold tracking-tight">Recursos</h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((item) => (
            <article key={item.title} className="rounded-2xl border bg-card p-5">
              <h3 className="text-[15px] font-semibold">{item.title}</h3>
              <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">{item.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="produto" className="border-t border-white/5">
        <div className="mx-auto max-w-6xl px-4 py-16">
          <h2 className="text-2xl font-semibold tracking-tight">Redes suportadas</h2>
          <p className="mt-2 max-w-xl text-[14px] text-muted-foreground">
            Publicação via o provedor configurado. Não afirmamos suporte além destas plataformas.
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            {platforms.map((platform) => (
              <span key={platform} className="rounded-full border px-3 py-1 text-[13px]">
                {socialPlatformLabel(platform)}
              </span>
            ))}
          </div>
        </div>
      </section>

      <section id="precos" className="border-t border-white/5 bg-zinc-950/40">
        <div className="mx-auto max-w-6xl px-4 py-16">
          <h2 className="text-2xl font-semibold tracking-tight">Preços</h2>
          <p className="mt-2 text-[14px] text-muted-foreground">Planos reais da configuração do {brand.name}.</p>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {PRODUCT_PLAN_CODES.map((code) => {
              const plan = PLAN_LIMITS[code];
              return (
                <article key={code} className="rounded-2xl border bg-card p-5">
                  <p className="text-[15px] font-semibold">{plan.name}</p>
                  <p className="mt-1 text-[20px] font-semibold">{planPriceLabel(code)}</p>
                  {planPriceLabel(code) !== "Grátis" ? <p className="text-[12px] text-muted-foreground">por mês</p> : null}
                  <ul className="mt-4 space-y-1.5 text-[13px] text-muted-foreground">
                    <li>{plan.monthlyMinutes} minutos / mês</li>
                    <li>Até {plan.maxClipsPerProject} clips por projeto</li>
                    <li>
                      {plan.maxAccounts === 1 ? "1 conta social" : `${plan.maxAccounts} contas sociais`}
                    </li>
                    <li>Exportação até {plan.maxResolution}</li>
                  </ul>
                  <Button asChild className="mt-6 w-full">
                    <Link href="/register">Começar</Link>
                  </Button>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-4 py-16">
        <h2 className="text-2xl font-semibold tracking-tight">Perguntas frequentes</h2>
        <div className="mt-6 space-y-4">
          {FAQ.map((item) => (
            <details key={item.q} className="rounded-2xl border bg-card px-4 py-3">
              <summary className="cursor-pointer text-[14px] font-medium">{item.q}</summary>
              <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">{item.a}</p>
            </details>
          ))}
        </div>
      </section>
    </main>
  );
}
