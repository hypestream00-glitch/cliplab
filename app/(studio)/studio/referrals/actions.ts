"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireWorkspaceContext } from "@/lib/auth/session";
import { rateLimit } from "@/lib/security/rate-limit";
import { cancelWithdrawal, requestWithdrawal } from "@/lib/referral/withdrawals";

function fail(message: string) {
  redirect(`/studio/referrals?error=${encodeURIComponent(message)}`);
}

export async function requestWithdrawalAction(formData: FormData) {
  const ctx = await requireWorkspaceContext();
  const limited = rateLimit({ key: `wd:${ctx.user.id}`, limit: 8, windowMs: 60 * 60 * 1000 });
  if (!limited.ok) fail("Muitas solicitações. Tente novamente em instantes.");
  const amount = Number(formData.get("amount"));
  const amountCents = Math.round(amount * 100);
  const result = await requestWithdrawal({
    userId: ctx.user.id,
    amountCents,
    pixKeyType: String(formData.get("pixKeyType") ?? ""),
    pixKey: String(formData.get("pixKey") ?? ""),
    holderName: String(formData.get("holderName") ?? ""),
    holderDocument: String(formData.get("holderDocument") ?? "") || undefined,
  });
  if (!result.ok) {
    const messages: Record<string, string> = {
      "invalid-amount": "Informe um valor válido.",
      "below-minimum": "O saque mínimo é R$ 30,00.",
      insufficient: "Saldo disponível insuficiente.",
      "invalid-pix": "Confira a chave PIX e o nome do titular.",
    };
    fail(messages[result.error] ?? "Não foi possível solicitar o saque.");
  }
  revalidatePath("/studio/referrals");
  redirect("/studio/referrals?ok=requested");
}

export async function cancelWithdrawalAction(formData: FormData) {
  const ctx = await requireWorkspaceContext();
  const withdrawalId = String(formData.get("withdrawalId") ?? "");
  const result = await cancelWithdrawal({ userId: ctx.user.id, withdrawalId });
  if (!result.ok) fail("Este saque não pode ser cancelado.");
  revalidatePath("/studio/referrals");
  redirect("/studio/referrals?ok=cancelled");
}
