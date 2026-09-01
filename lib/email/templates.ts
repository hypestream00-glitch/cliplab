import { brand } from "@/lib/config/brand";
import { appPathUrl } from "@/lib/email/app-url";
import { escapeHtml } from "@/lib/email/escape";

export type EmailTemplateId =
  | "verify-email"
  | "password-reset"
  | "welcome"
  | "subscription-activated"
  | "subscription-changed"
  | "subscription-canceled"
  | "payment-failed"
  | "processing-complete"
  | "processing-failed"
  | "referral-reward"
  | "withdrawal-approved"
  | "withdrawal-paid"
  | "withdrawal-rejected";

export type EmailTemplateVars = {
  name?: string;
  actionUrl?: string;
  planName?: string;
  periodEnd?: string;
  amountLabel?: string;
  reason?: string;
};

export type RenderedEmail = {
  id: EmailTemplateId;
  subject: string;
  html: string;
  text: string;
};

const PURPLE = "#7c3aed";

function layout(title: string, bodyHtml: string, bodyText: string, cta?: { label: string; href: string }): RenderedEmail["html"] {
  const button = cta
    ? `<p style="margin:28px 0 8px"><a href="${escapeHtml(cta.href)}" style="display:inline-block;background:${PURPLE};color:#fff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:600;font-size:14px">${escapeHtml(cta.label)}</a></p>`
    : "";
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;padding:0;background:#09090b;color:#fafafa;font-family:Inter,Segoe UI,Helvetica,Arial,sans-serif">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#09090b;padding:32px 12px">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width:560px;background:#18181b;border:1px solid #27272a;border-radius:16px;padding:32px">
          <tr>
            <td>
              <p style="margin:0 0 20px;font-size:12px;letter-spacing:.16em;text-transform:uppercase;color:${PURPLE};font-weight:700">${escapeHtml(brand.name)}</p>
              <h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;color:#fafafa">${escapeHtml(title)}</h1>
              ${bodyHtml}
              ${button}
              <p style="margin:28px 0 0;font-size:12px;line-height:1.5;color:#a1a1aa">Se você não reconhece esta mensagem, pode ignorá-la.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function greeting(vars: EmailTemplateVars) {
  const name = vars.name?.trim();
  return name ? `Olá, ${name}` : "Olá";
}

export function renderEmailTemplate(id: EmailTemplateId, vars: EmailTemplateVars = {}): RenderedEmail {
  const planName = escapeHtml(vars.planName?.trim() || brand.name);
  const periodEnd = escapeHtml(vars.periodEnd?.trim() || "");
  const hello = greeting(vars);

  switch (id) {
    case "verify-email": {
      const subject = `Confirme seu e-mail no ${brand.name}`;
      const text = `${hello},\n\nConfirme seu e-mail para ativar sua conta ${brand.name}.\n${vars.actionUrl ?? ""}\n\nSe você não criou a conta, ignore este e-mail.`;
      const html = layout(
        "Confirme seu e-mail",
        `<p style="margin:0;font-size:15px;line-height:1.6;color:#d4d4d8">${escapeHtml(hello)},</p><p style="margin:14px 0 0;font-size:15px;line-height:1.6;color:#d4d4d8">Clique no botão para confirmar que este e-mail é seu. O link expira em breve e só pode ser usado uma vez.</p>`,
        text,
        vars.actionUrl ? { label: "Verificar e-mail", href: vars.actionUrl } : undefined,
      );
      return { id, subject, html, text };
    }
    case "password-reset": {
      const subject = `Redefinir senha do ${brand.name}`;
      const text = `${hello},\n\nUse o link para escolher uma nova senha.\n${vars.actionUrl ?? ""}\n\nSe você não pediu isso, ignore este e-mail.`;
      const html = layout(
        "Redefinir senha",
        `<p style="margin:0;font-size:15px;line-height:1.6;color:#d4d4d8">${escapeHtml(hello)},</p><p style="margin:14px 0 0;font-size:15px;line-height:1.6;color:#d4d4d8">Recebemos um pedido para redefinir a senha desta conta. O link é de uso único e expira em 30 minutos.</p>`,
        text,
        vars.actionUrl ? { label: "Escolher nova senha", href: vars.actionUrl } : undefined,
      );
      return { id, subject, html, text };
    }
    case "welcome": {
      const subject = `Bem-vindo ao ${brand.name}`;
      const createUrl = vars.actionUrl ?? appPathUrl("/studio/create");
      const text = `${hello},\n\nSua conta ${brand.name} está pronta. Crie seu primeiro projeto:\n${createUrl}`;
      const html = layout(
        `Bem-vindo ao ${brand.name}`,
        `<p style="margin:0;font-size:15px;line-height:1.6;color:#d4d4d8">${escapeHtml(hello)},</p><p style="margin:14px 0 0;font-size:15px;line-height:1.6;color:#d4d4d8">Sua conta está confirmada. O próximo passo é criar o primeiro projeto e transformar um vídeo em clips.</p>`,
        text,
        { label: "Criar primeiro projeto", href: createUrl },
      );
      return { id, subject, html, text };
    }
    case "subscription-activated": {
      const subject = `Seu plano ${vars.planName?.trim() || brand.name} está ativo`;
      const text = `${hello},\n\nSeu plano ${vars.planName?.trim() || brand.name} está ativo. O plano só muda depois da confirmação do pagamento.`;
      const html = layout(
        `Seu plano ${planName} está ativo`,
        `<p style="margin:0;font-size:15px;line-height:1.6;color:#d4d4d8">${escapeHtml(hello)},</p><p style="margin:14px 0 0;font-size:15px;line-height:1.6;color:#d4d4d8">Confirmamos sua assinatura. O plano <strong style="color:#fff">${planName}</strong> já está disponível na sua conta.</p>`,
        text,
        { label: "Ver plano e uso", href: appPathUrl("/studio/settings/billing") },
      );
      return { id, subject, html, text };
    }
    case "subscription-changed": {
      const subject = "Seu plano foi alterado";
      const text = `${hello},\n\nSeu plano ${brand.name} agora é ${vars.planName?.trim() || "atualizado"}.`;
      const html = layout(
        "Seu plano foi alterado",
        `<p style="margin:0;font-size:15px;line-height:1.6;color:#d4d4d8">${escapeHtml(hello)},</p><p style="margin:14px 0 0;font-size:15px;line-height:1.6;color:#d4d4d8">Sua assinatura agora é <strong style="color:#fff">${planName}</strong>. Os limites da conta já seguem o novo plano.</p>`,
        text,
        { label: "Ver plano e uso", href: appPathUrl("/studio/settings/billing") },
      );
      return { id, subject, html, text };
    }
    case "subscription-canceled": {
      const when = vars.periodEnd?.trim();
      const subject = when ? `Sua assinatura será encerrada em ${when}` : "Sua assinatura foi encerrada";
      const text = when
        ? `${hello},\n\nSua assinatura ${brand.name} será encerrada em ${when}. Seus projetos permanecem.`
        : `${hello},\n\nSua assinatura ${brand.name} foi encerrada. Seus projetos, clips e contas sociais não foram removidos.`;
      const html = layout(
        when ? "Sua assinatura será encerrada" : "Sua assinatura foi encerrada",
        when
          ? `<p style="margin:0;font-size:15px;line-height:1.6;color:#d4d4d8">${escapeHtml(hello)},</p><p style="margin:14px 0 0;font-size:15px;line-height:1.6;color:#d4d4d8">Sua assinatura permanece ativa até <strong style="color:#fff">${periodEnd}</strong>. Depois disso, a conta volta ao plano Free. Seus dados permanecem.</p>`
          : `<p style="margin:0;font-size:15px;line-height:1.6;color:#d4d4d8">${escapeHtml(hello)},</p><p style="margin:14px 0 0;font-size:15px;line-height:1.6;color:#d4d4d8">Sua assinatura foi encerrada. Seus projetos, clips e contas sociais não foram removidos.</p>`,
        text,
        { label: "Ver plano e uso", href: appPathUrl("/studio/settings/billing") },
      );
      return { id, subject, html, text };
    }
    case "payment-failed": {
      const subject = "Não conseguimos processar seu pagamento";
      const text = `${hello},\n\nNão conseguimos processar o pagamento da sua assinatura ${brand.name}. Seus projetos não foram removidos. Atualize o pagamento quando possível.`;
      const html = layout(
        "Não conseguimos processar seu pagamento",
        `<p style="margin:0;font-size:15px;line-height:1.6;color:#d4d4d8">${escapeHtml(hello)},</p><p style="margin:14px 0 0;font-size:15px;line-height:1.6;color:#d4d4d8">Houve um problema no pagamento da assinatura. Seus projetos e contas sociais continuam na conta. Atualize o pagamento para evitar a interrupção do plano.</p>`,
        text,
        { label: "Gerenciar assinatura", href: appPathUrl("/studio/settings/billing") },
      );
      return { id, subject, html, text };
    }
    case "processing-complete": {
      const projectUrl = vars.actionUrl ?? appPathUrl("/studio/projects");
      const subject = "Seu projeto está pronto";
      const text = `${hello},\n\nO processamento terminou. Seus clips estão disponíveis.\n${projectUrl}`;
      const html = layout(
        "Seu projeto está pronto",
        `<p style="margin:0;font-size:15px;line-height:1.6;color:#d4d4d8">${escapeHtml(hello)},</p><p style="margin:14px 0 0;font-size:15px;line-height:1.6;color:#d4d4d8">A IA terminou de gerar os clips. Abra o projeto para editar, exportar ou publicar.</p>`,
        text,
        { label: "Ver clips", href: projectUrl },
      );
      return { id, subject, html, text };
    }
    case "processing-failed": {
      const projectUrl = vars.actionUrl ?? appPathUrl("/studio/projects");
      const subject = "Não foi possível processar seu vídeo";
      const text = `${hello},\n\nO processamento falhou. Seus arquivos não foram apagados. Tente novamente pelo projeto.\n${projectUrl}`;
      const html = layout(
        "Não foi possível processar seu vídeo",
        `<p style="margin:0;font-size:15px;line-height:1.6;color:#d4d4d8">${escapeHtml(hello)},</p><p style="margin:14px 0 0;font-size:15px;line-height:1.6;color:#d4d4d8">O job falhou. Nada foi cobrado duas vezes pelo mesmo processamento. Abra o projeto para ver o status e tentar de novo.</p>`,
        text,
        { label: "Abrir projeto", href: projectUrl },
      );
      return { id, subject, html, text };
    }
    case "referral-reward": {
      const ctaUrl = vars.actionUrl ?? `${brand.url}/studio/referrals`;
      const subject = `Você ganhou R$5 no ${brand.name} 🎉`;
      const text = `${hello},\n\nUma pessoa indicada por você assinou o ${brand.name}.\nVocê recebeu:\nR$5 de saldo\n+30 minutos de IA\n\nO saldo ficará disponível para saque após o período de validação.\n${ctaUrl}`;
      const html = layout(
        `Você ganhou R$5 no ${brand.name}`,
        `<p style="margin:0;font-size:15px;line-height:1.6;color:#d4d4d8">${escapeHtml(hello)},</p><p style="margin:14px 0 0;font-size:15px;line-height:1.6;color:#d4d4d8">Uma pessoa indicada por você assinou o ${escapeHtml(brand.name)}. Você recebeu <strong style="color:#fbbf24">R$5 de saldo</strong> e <strong style="color:#fff">+30 minutos de IA</strong>. O saldo ficará disponível para saque após o período de validação.</p>`,
        text,
        { label: "Ver minha carteira", href: ctaUrl },
      );
      return { id, subject, html, text };
    }
    case "withdrawal-approved": {
      const ctaUrl = vars.actionUrl ?? `${brand.url}/studio/referrals`;
      const amount = vars.amountLabel ?? "seu saque";
      const subject = `Seu saque do ${brand.name} foi aprovado`;
      const text = `${hello},\n\nSeu saque de ${amount} foi aprovado e será pago manualmente em breve.\n${ctaUrl}`;
      const html = layout(
        "Saque aprovado",
        `<p style="margin:0;font-size:15px;line-height:1.6;color:#d4d4d8">${escapeHtml(hello)},</p><p style="margin:14px 0 0;font-size:15px;line-height:1.6;color:#d4d4d8">Seu saque de <strong style="color:#fff">${escapeHtml(amount)}</strong> foi aprovado. O pagamento PIX será feito manualmente fora da plataforma.</p>`,
        text,
        { label: "Ver carteira", href: ctaUrl },
      );
      return { id, subject, html, text };
    }
    case "withdrawal-paid": {
      const ctaUrl = vars.actionUrl ?? `${brand.url}/studio/referrals`;
      const amount = vars.amountLabel ?? "seu saque";
      const subject = `Seu saque do ${brand.name} foi pago 💸`;
      const text = `${hello},\n\nSeu saque de ${amount} foi marcado como pago.\n${ctaUrl}`;
      const html = layout(
        "Saque pago",
        `<p style="margin:0;font-size:15px;line-height:1.6;color:#d4d4d8">${escapeHtml(hello)},</p><p style="margin:14px 0 0;font-size:15px;line-height:1.6;color:#d4d4d8">Seu saque de <strong style="color:#fbbf24">${escapeHtml(amount)}</strong> foi marcado como pago.</p>`,
        text,
        { label: "Ver carteira", href: ctaUrl },
      );
      return { id, subject, html, text };
    }
    case "withdrawal-rejected": {
      const ctaUrl = vars.actionUrl ?? `${brand.url}/studio/referrals`;
      const amount = vars.amountLabel ?? "seu saque";
      const reason = vars.reason?.trim() || "Os dados do saque precisam de revisão.";
      const subject = `Seu saque do ${brand.name} foi recusado`;
      const text = `${hello},\n\nSeu saque de ${amount} foi recusado. O valor voltou para sua carteira.\nMotivo: ${reason}\n${ctaUrl}`;
      const html = layout(
        "Saque recusado",
        `<p style="margin:0;font-size:15px;line-height:1.6;color:#d4d4d8">${escapeHtml(hello)},</p><p style="margin:14px 0 0;font-size:15px;line-height:1.6;color:#d4d4d8">Seu saque de <strong style="color:#fff">${escapeHtml(amount)}</strong> foi recusado. O valor voltou para o saldo disponível.</p><p style="margin:14px 0 0;font-size:15px;line-height:1.6;color:#d4d4d8">${escapeHtml(reason)}</p>`,
        text,
        { label: "Ver carteira", href: ctaUrl },
      );
      return { id, subject, html, text };
    }
    default: {
      const subject = brand.name;
      return { id, subject, html: layout(subject, "", subject), text: subject };
    }
  }
}

export function emailTemplate(id: EmailTemplateId) {
  const rendered = renderEmailTemplate(id);
  return { id, subject: rendered.subject, text: rendered.text, html: rendered.html };
}
