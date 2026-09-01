"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/session";
import { adminAdjustWallet, approveWithdrawal, markWithdrawalPaid, rejectWithdrawal } from "@/lib/referral/withdrawals";

function back(path: string, error?: string) {
  redirect(error ? `${path}?error=${encodeURIComponent(error)}` : path);
}

export async function approveWithdrawalAction(formData: FormData) {
  const admin = await requireAdmin();
  const withdrawalId = String(formData.get("withdrawalId") ?? "");
  const result = await approveWithdrawal({
    adminId: admin.id,
    withdrawalId,
    note: String(formData.get("note") ?? "") || undefined,
  });
  if (!result.ok) back(`/admin/affiliates/withdrawals/${withdrawalId}`, "Não foi possível aprovar.");
  revalidatePath("/admin/affiliates/withdrawals");
  back(`/admin/affiliates/withdrawals/${withdrawalId}`);
}

export async function rejectWithdrawalAction(formData: FormData) {
  const admin = await requireAdmin();
  const withdrawalId = String(formData.get("withdrawalId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  if (!reason) back(`/admin/affiliates/withdrawals/${withdrawalId}`, "Informe o motivo da rejeição.");
  const result = await rejectWithdrawal({ adminId: admin.id, withdrawalId, reason });
  if (!result.ok) back(`/admin/affiliates/withdrawals/${withdrawalId}`, "Não foi possível rejeitar.");
  revalidatePath("/admin/affiliates/withdrawals");
  back(`/admin/affiliates/withdrawals/${withdrawalId}`);
}

export async function markWithdrawalPaidAction(formData: FormData) {
  const admin = await requireAdmin();
  const withdrawalId = String(formData.get("withdrawalId") ?? "");
  const paymentReference = String(formData.get("paymentReference") ?? "").trim();
  if (!paymentReference) back(`/admin/affiliates/withdrawals/${withdrawalId}`, "Informe a referência do PIX.");
  const result = await markWithdrawalPaid({ adminId: admin.id, withdrawalId, paymentReference });
  if (!result.ok) back(`/admin/affiliates/withdrawals/${withdrawalId}`, "Não foi possível marcar como pago.");
  revalidatePath("/admin/affiliates/withdrawals");
  back(`/admin/affiliates/withdrawals/${withdrawalId}`);
}

export async function adminWalletAdjustAction(formData: FormData) {
  const admin = await requireAdmin();
  const userId = String(formData.get("userId") ?? "");
  const amount = Number(formData.get("amount"));
  const amountCents = Math.round(amount * 100);
  const reason = String(formData.get("reason") ?? "").trim();
  const result = await adminAdjustWallet({ adminId: admin.id, userId, amountCents, reason });
  if (!result.ok) back(`/admin/affiliates/${userId}`, "Ajuste não aplicado. Informe motivo e um valor válido.");
  revalidatePath(`/admin/affiliates/${userId}`);
  back(`/admin/affiliates/${userId}`);
}
