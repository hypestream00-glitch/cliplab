import { NextResponse } from "next/server";
import { findReferralProfileByCode } from "@/lib/referral/profile";
import { setReferralCookie } from "@/lib/referral/cookie";
import { appPathUrl } from "@/lib/email/app-url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ code: string }> }) {
  const { code } = await context.params;
  const profile = await findReferralProfileByCode(code);
  if (profile) {
    await setReferralCookie(profile.code);
    const url = new URL(appPathUrl("/register"));
    url.searchParams.set("ref", profile.code);
    return NextResponse.redirect(url);
  }
  return NextResponse.redirect(new URL(appPathUrl("/register")));
}
