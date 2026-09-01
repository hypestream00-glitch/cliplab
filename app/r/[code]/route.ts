import { NextResponse } from "next/server";
import { findReferralProfileByCode } from "@/lib/referral/profile";
import { setReferralCookie } from "@/lib/referral/cookie";
import { recordReferralClick } from "@/lib/referral/clicks";
import { appPathUrl } from "@/lib/email/app-url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ code: string }> }) {
  const { code } = await context.params;
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? request.headers.get("x-real-ip");
  const userAgent = request.headers.get("user-agent");
  await recordReferralClick({ code, ip, userAgent }).catch(() => undefined);
  const profile = await findReferralProfileByCode(code);
  if (profile) {
    await setReferralCookie(profile.code);
    const url = new URL(appPathUrl("/register"));
    url.searchParams.set("ref", profile.code);
    return NextResponse.redirect(url);
  }
  return NextResponse.redirect(new URL(appPathUrl("/register")));
}
