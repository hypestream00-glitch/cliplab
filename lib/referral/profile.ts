import { prisma } from "@/lib/db/prisma";
import { generateReferralCode, normalizeReferralCode } from "@/lib/referral/code";

export async function ensureReferralProfile(userId: string) {
  const existing = await prisma.referralProfile.findUnique({ where: { userId } });
  if (existing) return existing;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const code = generateReferralCode();
    try {
      return await prisma.referralProfile.create({ data: { userId, code } });
    } catch {
      const collision = await prisma.referralProfile.findUnique({ where: { code } });
      if (!collision) throw new Error("referral profile create failed");
    }
  }
  throw new Error("referral code exhausted");
}

export async function findReferralProfileByCode(raw: string) {
  const code = normalizeReferralCode(raw);
  if (code.length < 6) return null;
  return prisma.referralProfile.findUnique({ where: { code } });
}
