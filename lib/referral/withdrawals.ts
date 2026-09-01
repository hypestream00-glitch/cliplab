import { prisma } from "@/lib/db/prisma";
import { encryptSecret } from "@/lib/security/crypto";
import { hashToken } from "@/lib/security/crypto";
import { lockWalletUser, writeAdminAction, writeAuditLog } from "@/lib/referral/audit";
import { MIN_WITHDRAWAL_CENTS } from "@/lib/referral/config";
import {
  isPixKeyType,
  maskHolderDocument,
  maskPixKey,
  normalizePixKey,
  validatePixKey,
  type PixKeyType,
} from "@/lib/referral/pix";
import { appendLedger, LEDGER_AVAILABLE, walletBalance, WalletNegativeError } from "@/lib/referral/wallet";
import {
  sendWithdrawalApprovedEmail,
  sendWithdrawalPaidEmail,
  sendWithdrawalRejectedEmail,
} from "@/lib/email/send";
import { logger } from "@/lib/logger";

export type WithdrawalError =
  | "unauthenticated"
  | "invalid-amount"
  | "below-minimum"
  | "insufficient"
  | "invalid-pix"
  | "invalid-status"
  | "not-found"
  | "forbidden";

export async function requestWithdrawal(params: {
  userId: string;
  amountCents: number;
  pixKeyType: string;
  pixKey: string;
  holderName: string;
  holderDocument?: string;
}) {
  if (!Number.isInteger(params.amountCents) || params.amountCents <= 0) {
    return { ok: false as const, error: "invalid-amount" as const };
  }
  if (params.amountCents < MIN_WITHDRAWAL_CENTS) {
    return { ok: false as const, error: "below-minimum" as const };
  }
  if (!isPixKeyType(params.pixKeyType)) {
    return { ok: false as const, error: "invalid-pix" as const };
  }
  const type = params.pixKeyType as PixKeyType;
  if (!validatePixKey(type, params.pixKey)) {
    return { ok: false as const, error: "invalid-pix" as const };
  }
  const holderName = params.holderName.trim().slice(0, 80);
  if (holderName.length < 3) return { ok: false as const, error: "invalid-pix" as const };
  const normalized = normalizePixKey(type, params.pixKey);

  try {
    const withdrawal = await prisma.$transaction(async (tx) => {
      await lockWalletUser(tx, params.userId);
      const { available } = await walletBalance(params.userId, tx);
      if (params.amountCents > available) throw new WalletNegativeError();
      const row = await tx.withdrawal.create({
        data: {
          userId: params.userId,
          amountCents: params.amountCents,
          status: "REQUESTED",
          pixKeyType: type,
          pixKeyFingerprint: hashToken(`pix:${type}:${normalized}`),
          pixKeyCipher: encryptSecret(normalized),
          pixKeyMasked: maskPixKey(type, normalized),
          holderName,
          holderDocumentMasked: params.holderDocument ? maskHolderDocument(params.holderDocument) : null,
        },
      });
      await appendLedger(tx, {
        userId: params.userId,
        type: "WITHDRAWAL_RESERVE",
        amountCents: -params.amountCents,
        balanceKind: LEDGER_AVAILABLE,
        idempotencyKey: `wd-reserve:${row.id}`,
        withdrawalId: row.id,
      });
      await writeAuditLog(
        {
          action: "WITHDRAWAL_REQUESTED",
          entityType: "Withdrawal",
          entityId: row.id,
          userId: params.userId,
          metadata: { amountCents: params.amountCents, pixKeyType: type, pixKeyMasked: row.pixKeyMasked },
        },
        tx,
      );
      return row;
    });
    return { ok: true as const, withdrawalId: withdrawal.id };
  } catch (error) {
    if (error instanceof WalletNegativeError) return { ok: false as const, error: "insufficient" as const };
    throw error;
  }
}

export async function cancelWithdrawal(params: { userId: string; withdrawalId: string }) {
  try {
    await prisma.$transaction(async (tx) => {
      const row = await tx.withdrawal.findUnique({ where: { id: params.withdrawalId } });
      if (!row || row.userId !== params.userId) throw Object.assign(new Error("not-found"), { code: "not-found" });
      if (row.status !== "REQUESTED") throw Object.assign(new Error("invalid-status"), { code: "invalid-status" });
      await lockWalletUser(tx, params.userId);
      const again = await tx.withdrawal.findUnique({ where: { id: params.withdrawalId } });
      if (!again || again.status !== "REQUESTED") throw Object.assign(new Error("invalid-status"), { code: "invalid-status" });
      await appendLedger(tx, {
        userId: params.userId,
        type: "WITHDRAWAL_RELEASE",
        amountCents: again.amountCents,
        balanceKind: LEDGER_AVAILABLE,
        idempotencyKey: `wd-release:${again.id}`,
        withdrawalId: again.id,
      });
      await tx.withdrawal.update({
        where: { id: again.id },
        data: { status: "CANCELLED", cancelledAt: new Date() },
      });
      await writeAuditLog(
        {
          action: "WITHDRAWAL_CANCELLED",
          entityType: "Withdrawal",
          entityId: again.id,
          userId: params.userId,
          metadata: { amountCents: again.amountCents },
        },
        tx,
      );
    });
    return { ok: true as const };
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
    if (code === "not-found") return { ok: false as const, error: "not-found" as const };
    if (code === "invalid-status") return { ok: false as const, error: "invalid-status" as const };
    throw error;
  }
}

async function notifyWithdrawal(
  userId: string,
  kind: "approved" | "paid" | "rejected",
  amountCents: number,
  withdrawalId: string,
  reason?: string,
) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, name: true } });
  if (!user?.email) return;
  const send =
    kind === "approved"
      ? sendWithdrawalApprovedEmail
      : kind === "paid"
        ? sendWithdrawalPaidEmail
        : sendWithdrawalRejectedEmail;
  await send({
    to: user.email,
    userId,
    name: user.name,
    amountCents,
    withdrawalId,
    reason,
  }).catch((error) => {
    logger.warn({ errType: error instanceof Error ? error.name : "Error" }, "EMAIL WITHDRAWAL QUEUE FAILED");
  });
}

export async function approveWithdrawal(params: { adminId: string; withdrawalId: string; note?: string }) {
  const row = await prisma.withdrawal.findUnique({ where: { id: params.withdrawalId } });
  if (!row) return { ok: false as const, error: "not-found" as const };
  if (row.status !== "REQUESTED") return { ok: false as const, error: "invalid-status" as const };
  await prisma.withdrawal.update({
    where: { id: row.id },
    data: {
      status: "APPROVED",
      approvedAt: new Date(),
      approvedById: params.adminId,
      adminNote: params.note?.slice(0, 240) || row.adminNote,
    },
  });
  await writeAuditLog({
    action: "WITHDRAWAL_APPROVED",
    entityType: "Withdrawal",
    entityId: row.id,
    userId: params.adminId,
    metadata: { amountCents: row.amountCents, targetUserId: row.userId },
  });
  await writeAdminAction({
    adminId: params.adminId,
    action: "WITHDRAWAL_APPROVED",
    entityType: "Withdrawal",
    entityId: row.id,
    metadata: { amountCents: row.amountCents },
  });
  await notifyWithdrawal(row.userId, "approved", row.amountCents, row.id);
  return { ok: true as const };
}

export async function rejectWithdrawal(params: { adminId: string; withdrawalId: string; reason: string }) {
  const reason = params.reason.trim().slice(0, 240);
  if (!reason) return { ok: false as const, error: "invalid-status" as const };
  try {
    const row = await prisma.$transaction(async (tx) => {
      const current = await tx.withdrawal.findUnique({ where: { id: params.withdrawalId } });
      if (!current) throw Object.assign(new Error("not-found"), { code: "not-found" });
      if (current.status !== "REQUESTED" && current.status !== "APPROVED") {
        throw Object.assign(new Error("invalid-status"), { code: "invalid-status" });
      }
      await lockWalletUser(tx, current.userId);
      const again = await tx.withdrawal.findUnique({ where: { id: params.withdrawalId } });
      if (!again || (again.status !== "REQUESTED" && again.status !== "APPROVED")) {
        throw Object.assign(new Error("invalid-status"), { code: "invalid-status" });
      }
      await appendLedger(tx, {
        userId: again.userId,
        type: "WITHDRAWAL_RELEASE",
        amountCents: again.amountCents,
        balanceKind: LEDGER_AVAILABLE,
        idempotencyKey: `wd-release:${again.id}`,
        withdrawalId: again.id,
        reason,
      });
      const updated = await tx.withdrawal.update({
        where: { id: again.id },
        data: {
          status: "REJECTED",
          rejectedAt: new Date(),
          rejectedById: params.adminId,
          rejectionReason: reason,
        },
      });
      await writeAuditLog(
        {
          action: "WITHDRAWAL_REJECTED",
          entityType: "Withdrawal",
          entityId: again.id,
          userId: params.adminId,
          metadata: { amountCents: again.amountCents, targetUserId: again.userId, reason },
        },
        tx,
      );
      return updated;
    });
    await writeAdminAction({
      adminId: params.adminId,
      action: "WITHDRAWAL_REJECTED",
      entityType: "Withdrawal",
      entityId: row.id,
      metadata: { reason },
    });
    await notifyWithdrawal(row.userId, "rejected", row.amountCents, row.id, reason);
    return { ok: true as const };
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
    if (code === "not-found") return { ok: false as const, error: "not-found" as const };
    if (code === "invalid-status") return { ok: false as const, error: "invalid-status" as const };
    throw error;
  }
}

export async function markWithdrawalPaid(params: {
  adminId: string;
  withdrawalId: string;
  paymentReference: string;
}) {
  const reference = params.paymentReference.trim().slice(0, 180);
  if (!reference) return { ok: false as const, error: "invalid-status" as const };
  const row = await prisma.$transaction(async (tx) => {
    const current = await tx.withdrawal.findUnique({ where: { id: params.withdrawalId } });
    if (!current) throw Object.assign(new Error("not-found"), { code: "not-found" });
    if (current.status === "PAID") return current;
    if (current.status !== "APPROVED") throw Object.assign(new Error("invalid-status"), { code: "invalid-status" });
    await lockWalletUser(tx, current.userId);
    const updated = await tx.withdrawal.update({
      where: { id: current.id },
      data: {
        status: "PAID",
        paidAt: new Date(),
        paidById: params.adminId,
        paymentReference: reference,
      },
    });
    await appendLedger(tx, {
      userId: current.userId,
      type: "WITHDRAWAL_PAID",
      amountCents: 0,
      balanceKind: LEDGER_AVAILABLE,
      idempotencyKey: `wd-paid:${current.id}`,
      withdrawalId: current.id,
      reason: reference,
    });
    await writeAuditLog(
      {
        action: "WITHDRAWAL_PAID",
        entityType: "Withdrawal",
        entityId: current.id,
        userId: params.adminId,
        metadata: { amountCents: current.amountCents, targetUserId: current.userId, paymentReference: reference },
      },
      tx,
    );
    return updated;
  }).catch((error) => {
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
    if (code === "not-found" || code === "invalid-status") return { error: code as WithdrawalError };
    throw error;
  });
  if (row && "error" in row) return { ok: false as const, error: row.error };
  await writeAdminAction({
    adminId: params.adminId,
    action: "WITHDRAWAL_PAID",
    entityType: "Withdrawal",
    entityId: params.withdrawalId,
    metadata: { paymentReference: reference },
  });
  if (row && "userId" in row) await notifyWithdrawal(row.userId, "paid", row.amountCents, row.id);
  return { ok: true as const };
}

export async function adminAdjustWallet(params: {
  adminId: string;
  userId: string;
  amountCents: number;
  reason: string;
}) {
  const reason = params.reason.trim().slice(0, 240);
  if (!reason) return { ok: false as const, error: "invalid-status" as const };
  if (!Number.isInteger(params.amountCents) || params.amountCents === 0) {
    return { ok: false as const, error: "invalid-amount" as const };
  }
  const key = `admin-adj:${params.adminId}:${params.userId}:${params.amountCents}:${reason}:${Date.now()}`;
  try {
    await prisma.$transaction(async (tx) => {
      await lockWalletUser(tx, params.userId);
      await appendLedger(tx, {
        userId: params.userId,
        type: "ADMIN_ADJUSTMENT",
        amountCents: params.amountCents,
        balanceKind: LEDGER_AVAILABLE,
        idempotencyKey: key,
        reason,
      });
      await writeAuditLog(
        {
          action: "ADMIN_WALLET_ADJUSTMENT",
          entityType: "User",
          entityId: params.userId,
          userId: params.adminId,
          metadata: { amountCents: params.amountCents, reason, targetUserId: params.userId },
        },
        tx,
      );
    });
  } catch (error) {
    if (error instanceof WalletNegativeError) return { ok: false as const, error: "insufficient" as const };
    throw error;
  }
  await writeAdminAction({
    adminId: params.adminId,
    action: "ADMIN_WALLET_ADJUSTMENT",
    entityType: "User",
    entityId: params.userId,
    metadata: { amountCents: params.amountCents, reason },
  });
  return { ok: true as const };
}
