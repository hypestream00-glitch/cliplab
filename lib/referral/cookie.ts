import { cookies } from "next/headers";
import { cookieSecure } from "@/lib/security/cookies";
import { normalizeReferralCode } from "@/lib/referral/code";

export const REFERRAL_COOKIE = "cliplab_ref";
const MAX_AGE = 60 * 60 * 24 * 30;

export async function setReferralCookie(code: string) {
  const normalized = normalizeReferralCode(code);
  if (!normalized) return;
  const store = await cookies();
  store.set(REFERRAL_COOKIE, normalized, {
    httpOnly: true,
    sameSite: "lax",
    secure: cookieSecure(),
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function getReferralCookie() {
  const store = await cookies();
  const raw = store.get(REFERRAL_COOKIE)?.value ?? "";
  return normalizeReferralCode(raw) || null;
}
