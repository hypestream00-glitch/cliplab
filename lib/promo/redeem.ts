import { prisma } from "@/lib/db/prisma";
import { isPrismaUniqueViolation } from "@/lib/webhooks/idempotency";
import { applyPlanGrant } from "@/lib/billing/grants";
import { findPromoByCode } from "@/lib/promo/ensure";
import { normalizePromoCode } from "@/lib/promo/catalog";

export type RedeemPromoResult =
  | { ok: true; code: string; days: number; planCode: string; endsAt: Date }
  | { ok: false; reason: "invalid" | "expired" | "already-used" | "inactive" };

export async function redeemPromoCode(params: {
  userId: string;
  workspaceId: string;
  code: string;
  now?: Date;
}): Promise<RedeemPromoResult> {
  const now = params.now ?? new Date();
  const normalized = normalizePromoCode(params.code);
  const promo = await findPromoByCode(normalized);
  if (!promo) return { ok: false, reason: "invalid" };
  if (!promo.active) return { ok: false, reason: "inactive" };
  if (promo.expiresAt && promo.expiresAt.getTime() <= now.getTime()) return { ok: false, reason: "expired" };

  const already = await prisma.promoRedemption.findUnique({
    where: { promoCodeId_userId: { promoCodeId: promo.id, userId: params.userId } },
  });
  if (already) return { ok: false, reason: "already-used" };

  if (promo.maxRedemptions != null) {
    const used = await prisma.promoRedemption.count({ where: { promoCodeId: promo.id } });
    if (used >= promo.maxRedemptions) return { ok: false, reason: "expired" };
  }

  try {
    const grant = await applyPlanGrant({
      workspaceId: params.workspaceId,
      userId: params.userId,
      source: "PROMO",
      sourceKey: promo.code,
      planCode: promo.grantPlanCode,
      days: promo.benefitDays,
      now,
    });
    await prisma.promoRedemption.create({
      data: {
        promoCodeId: promo.id,
        userId: params.userId,
        workspaceId: params.workspaceId,
        grantId: grant.id,
        redeemedAt: now,
      },
    });
    return {
      ok: true,
      code: promo.code,
      days: promo.benefitDays,
      planCode: promo.grantPlanCode,
      endsAt: grant.endsAt,
    };
  } catch (error) {
    if (isPrismaUniqueViolation(error)) return { ok: false, reason: "already-used" };
    throw error;
  }
}

export function redeemPromoMessage(result: RedeemPromoResult) {
  if (result.ok) return "Cupom aplicado!";
  if (result.reason === "already-used") return "Este cupom já foi utilizado nesta conta.";
  return "Cupom inválido ou expirado.";
}
