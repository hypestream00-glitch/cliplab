import { prisma } from "@/lib/db/prisma";
import { isPrismaUniqueViolation } from "@/lib/webhooks/idempotency";
import { findReferralProfileByCode } from "@/lib/referral/profile";
import { normalizeReferralCode } from "@/lib/referral/code";

export async function attributeReferral(params: { referredUserId: string; code: string | null | undefined }) {
  const code = params.code ? normalizeReferralCode(params.code) : "";
  if (!code) return { ok: false as const, reason: "missing" as const };
  const profile = await findReferralProfileByCode(code);
  if (!profile) return { ok: false as const, reason: "invalid" as const };
  if (profile.userId === params.referredUserId) return { ok: false as const, reason: "self" as const };

  const existing = await prisma.referralAttribution.findUnique({
    where: { referredUserId: params.referredUserId },
  });
  if (existing) return { ok: false as const, reason: "duplicate" as const };

  try {
    const row = await prisma.referralAttribution.create({
      data: {
        referrerUserId: profile.userId,
        referredUserId: params.referredUserId,
        code: profile.code,
      },
    });
    return { ok: true as const, attributionId: row.id, referrerUserId: profile.userId };
  } catch (error) {
    if (isPrismaUniqueViolation(error)) return { ok: false as const, reason: "duplicate" as const };
    throw error;
  }
}
