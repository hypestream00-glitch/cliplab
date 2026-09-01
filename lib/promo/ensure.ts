import { prisma } from "@/lib/db/prisma";
import { MUGAO12, normalizePromoCode } from "@/lib/promo/catalog";

export async function ensurePromoCodes() {
  await prisma.promoCode.upsert({
    where: { code: MUGAO12.code },
    create: {
      code: MUGAO12.code,
      name: MUGAO12.name,
      description: MUGAO12.description,
      active: true,
      benefitType: MUGAO12.benefitType,
      grantPlanCode: MUGAO12.grantPlanCode,
      benefitDays: MUGAO12.benefitDays,
    },
    update: {
      name: MUGAO12.name,
      description: MUGAO12.description,
      benefitType: MUGAO12.benefitType,
      grantPlanCode: MUGAO12.grantPlanCode,
      benefitDays: MUGAO12.benefitDays,
    },
  });
}

export async function findPromoByCode(raw: string) {
  const code = normalizePromoCode(raw);
  if (!code) return null;
  await ensurePromoCodes();
  return prisma.promoCode.findUnique({ where: { code } });
}
