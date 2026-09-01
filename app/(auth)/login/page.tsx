import Link from "next/link";
import { brand } from "@/lib/config/brand";
import { LoginForm } from "@/app/(auth)/login-form";
import { isGoogleAuthEnabled } from "@/lib/auth";
import type { PageSearchProps } from "@/types/routes";

export const metadata = { title: "Entrar" };

export default async function LoginPage({ searchParams }: PageSearchProps) {
  const params = await searchParams;
  const resetOk = params.reset === "1";
  return (
    <div className="relative flex min-h-screen flex-col px-4">
      <div className="flex h-12 items-center justify-between">
        <Link href="/" className="text-[13px] text-muted-foreground hover:text-foreground">
          ← Voltar ao início
        </Link>
      </div>
      <div className="flex flex-1 items-center justify-center pb-16">
        <div className="w-full max-w-[400px]">
          <div className="mb-8 flex flex-col items-center text-center">
            <span className="flex size-9 items-center justify-center rounded-lg gradient-brand text-[12px] font-semibold text-white">
              {brand.shortName}
            </span>
            <h1 className="mt-4 text-[26px] leading-8 font-semibold tracking-tight">Entrar</h1>
            <p className="mt-1.5 text-[14px] text-muted-foreground">Acesse seu workspace {brand.name}.</p>
          </div>
          <LoginForm googleEnabled={isGoogleAuthEnabled} />
          {resetOk ? (
            <p className="mt-4 text-center text-[13px] text-muted-foreground">Senha atualizada. Entre com a nova senha.</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
