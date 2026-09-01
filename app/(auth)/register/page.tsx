import { RegisterForm } from "@/app/(auth)/register-form";
import { setReferralCookie } from "@/lib/referral/cookie";
import { normalizeReferralCode } from "@/lib/referral/code";
import type { PageSearchProps } from "@/types/routes";

export const metadata = { title: "Criar conta" };

export default async function RegisterPage({ searchParams }: PageSearchProps) {
  const params = await searchParams;
  const ref = typeof params.ref === "string" ? normalizeReferralCode(params.ref) : "";
  if (ref) await setReferralCookie(ref);
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <RegisterForm referralCode={ref || undefined} />
    </div>
  );
}
