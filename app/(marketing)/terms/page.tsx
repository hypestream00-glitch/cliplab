import { brand } from "@/lib/config/brand";

export const metadata = { title: "Termos de Uso" };

export default function TermsPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-16">
      <p className="text-[12px] font-medium tracking-wide text-amber-300 uppercase">Rascunho para revisão jurídica</p>
      <h1 className="mt-2 text-[24px] font-semibold">Termos de Uso</h1>
      <p className="mt-3 text-[14px] leading-relaxed text-muted-foreground">
        Este texto é um modelo estrutural do {brand.name}. Não é aconselhamento jurídico. Precisa de revisão de um
        advogado antes do lançamento público.
      </p>
      <section className="mt-8 space-y-4 text-[14px] leading-relaxed text-muted-foreground">
        <h2 className="text-[16px] font-semibold text-foreground">1. O serviço</h2>
        <p>
          O {brand.name} oferece ferramentas para enviar vídeos, gerar clips, editar, renderizar e publicar em redes
          sociais conectadas pelo usuário.
        </p>
        <h2 className="text-[16px] font-semibold text-foreground">2. Conta</h2>
        <p>Você é responsável por manter a senha em sigilo e por toda atividade na conta.</p>
        <h2 className="text-[16px] font-semibold text-foreground">3. Conteúdo</h2>
        <p>
          Você declara ter direito de processar e publicar o material enviado. Não envie conteúdo ilegal, confidencial
          de terceiros sem autorização ou que viole direitos autorais.
        </p>
        <h2 className="text-[16px] font-semibold text-foreground">4. Planos e limites</h2>
        <p>Os limites do plano vigente valem no servidor. O plano só muda depois da confirmação do pagamento.</p>
        <h2 className="text-[16px] font-semibold text-foreground">5. Contato</h2>
        <p>{brand.supportEmail}</p>
      </section>
    </main>
  );
}
