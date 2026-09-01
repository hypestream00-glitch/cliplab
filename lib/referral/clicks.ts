import { prisma } from "@/lib/db/prisma";
import { hashToken } from "@/lib/security/crypto";
import { findReferralProfileByCode } from "@/lib/referral/profile";
import { normalizeReferralCode } from "@/lib/referral/code";

export async function recordReferralClick(params: {
  code: string;
  ip?: string | null;
  userAgent?: string | null;
}) {
  const code = normalizeReferralCode(params.code);
  if (code.length < 6) return null;
  const profile = await findReferralProfileByCode(code);
  await prisma.referralClick.create({
    data: {
      code,
      referrerUserId: profile?.userId ?? null,
      ipHash: params.ip ? hashToken(`ip:${params.ip}`) : null,
      userAgentHash: params.userAgent ? hashToken(`ua:${params.userAgent.slice(0, 180)}`) : null,
    },
  });
  return profile;
}
