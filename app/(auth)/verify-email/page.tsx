import Link from "next/link";
import type { ReactNode } from "react";
import { headers } from "next/headers";
import { brand } from "@/lib/config/brand";
import { maskEmail } from "@/lib/email/escape";
import { getVerifyEmailHint } from "@/lib/email/hint-cookie";
import { peekAuthToken } from "@/lib/email/tokens";
import { isEmailLinkPrefetch } from "@/lib/email/verify-request";
import { verificationFailureMessage } from "@/lib/email/verify";
import { VerifyEmailClient } from "@/app/(auth)/verify-email-client";
import { ConfirmEmailClient } from "@/app/(auth)/confirm-email-client";
import type { PageSearchProps } from "@/types/routes";

export const metadata = { title: "Verifique seu e-mail" };
export const dynamic = "force-dynamic";

export default async function VerifyEmailPage({ searchParams }: PageSearchProps) {
  const params = await searchParams;
  const token = typeof params.token === "string" ? params.token : "";
  if (token) {
    if (isEmailLinkPrefetch(await headers())) {
      return (
        <AuthCard title="Confirme seu e-mail">
          <p className="text-[14px] text-muted-foreground">
            Abra este link no navegador para ativar sua conta. O token ainda não foi usado.
          </p>
        </AuthCard>
      );
    }
    const peeked = await peekAuthToken("verify", token);
    if (peeked.ok) {
      return (
        <AuthCard title="Confirme seu e-mail">
          <p className="text-[14px] text-muted-foreground">
            Estamos confirmando <span className="text-foreground">{maskEmail(peeked.email)}</span>.
          </p>
          <ConfirmEmailClient token={token} />
        </AuthCard>
      );
    }
    const expiredEmail = "email" in peeked && peeked.email ? peeked.email : null;
    return (
      <AuthCard title="Link expirado">
        <p className="text-[14px] text-muted-foreground">{verificationFailureMessage(peeked.reason)}</p>
        <VerifyEmailClient masked={expiredEmail ? maskEmail(expiredEmail) : null} expired token={token} />
      </AuthCard>
    );
  }

  const email = await getVerifyEmailHint();
  return (
    <AuthCard title="Verifique seu e-mail">
      <p className="text-[14px] text-muted-foreground">
        Enviamos um link de confirmação
        {email ? <> para <span className="text-foreground">{maskEmail(email)}</span></> : null}. Abra a mensagem e
        clique no botão para ativar sua conta.
      </p>
      <VerifyEmailClient masked={email ? maskEmail(email) : null} />
    </AuthCard>
  );
}

function AuthCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-[400px] text-center">
        <span className="mx-auto mb-4 flex size-9 items-center justify-center rounded-lg bg-primary text-[12px] font-semibold text-primary-foreground">
          {brand.shortName}
        </span>
        <h1 className="text-[22px] font-semibold tracking-tight">{title}</h1>
        <div className="mt-3 space-y-4">{children}</div>
        <p className="mt-6 text-[13px]">
          <Link href="/login" className="text-muted-foreground hover:text-foreground">
            Voltar ao login
          </Link>
        </p>
      </div>
    </div>
  );
}
