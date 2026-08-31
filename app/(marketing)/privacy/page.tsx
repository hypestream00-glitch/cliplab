import { brand } from "@/lib/config/brand";

export const metadata = { title: "Política de Privacidade" };

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-16">
      <p className="text-[12px] font-medium tracking-wide text-amber-300 uppercase">Rascunho para revisão jurídica</p>
      <h1 className="mt-2 text-[24px] font-semibold">Política de Privacidade</h1>
      <p className="mt-3 text-[14px] leading-relaxed text-muted-foreground">
        Modelo estrutural do {brand.name}. Não substitui uma política revisada por um advogado antes do lançamento.
      </p>
      <section className="mt-8 space-y-4 text-[14px] leading-relaxed text-muted-foreground">
        <h2 className="text-[16px] font-semibold text-foreground">Dados que tratamos</h2>
        <p>Nome, e-mail, senha com hash, vídeos enviados, transcripts, clips, conexões sociais e métricas das contas conectadas.</p>
        <h2 className="text-[16px] font-semibold text-foreground">Finalidade</h2>
        <p>Operar a conta, processar mídia, publicar quando você solicita, faturar o plano e enviar e-mails transacionais.</p>
        <h2 className="text-[16px] font-semibold text-foreground">Provedores</h2>
        <p>
          Armazenamento de objetos, fila, transcrição/IA, pagamento e publicação social processam dados necessários para
          cada função. Não vendemos sua lista de e-mails.
        </p>
        <h2 className="text-[16px] font-semibold text-foreground">Retenção</h2>
        <p>Mantemos os dados enquanto a conta existir, salvo obrigação legal. A exclusão completa da conta ainda está em implementação segura.</p>
        <h2 className="text-[16px] font-semibold text-foreground">Contato</h2>
        <p>{brand.supportEmail}</p>
      </section>
    </main>
  );
}
