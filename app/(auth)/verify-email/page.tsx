import Link from "next/link";
import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { brand } from "@/lib/config/brand";
import { maskEmail } from "@/lib/email/escape";
import { getVerifyEmailHint, setVerifyEmailHint } from "@/lib/email/hint-cookie";
import { verifyEmailByToken } from "@/app/(auth)/actions";
import { VerifyEmailClient } from "@/app/(auth)/verify-email-client";
import type { PageSearchProps } from "@/types/routes";

export const metadata = { title: "Verifique seu e-mail" };

export default async function VerifyEmailPage({ searchParams }: PageSearchProps) {
  const params = await searchParams;
  const token = typeof params.token === "string" ? params.token : "";
  if (token) {
    const result = await verifyEmailByToken(token);
    if (result.ok) {
      redirect(result.onboardingCompleted ? "/studio" : "/onboarding");
    }
    const expiredEmail = "email" in result && result.email ? result.email : null;
    if (expiredEmail) {
      await setVerifyEmailHint(expiredEmail);
    }
    return (
      <AuthCard title="Link expirado">
        <p className="text-[14px] text-muted-foreground">
          Este link de verificação não é mais válido. Solicite um novo e-mail para continuar.
        </p>
        <VerifyEmailClient masked={expiredEmail ? maskEmail(expiredEmail) : null} expired />
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
