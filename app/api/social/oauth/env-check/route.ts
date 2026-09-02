import { NextResponse } from "next/server";
import { googleOAuthEnvPresence, logGoogleOAuthEnvPresence } from "@/lib/env/request-env";
import { limitAction } from "@/lib/security/action-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

/** Temporary runtime probe. Returns presence booleans only — never secret values. */
export async function GET() {
  const limited = await limitAction("oauth-env-check", 30, 60_000);
  if (!limited.ok) {
    return NextResponse.json({ error: "rate-limit" }, { status: 429, headers: { "Cache-Control": "no-store" } });
  }
  logGoogleOAuthEnvPresence();
  const presence = googleOAuthEnvPresence();
  return NextResponse.json(
    {
      googleClientIdPresent: presence.googleClientIdPresent,
      googleClientSecretPresent: presence.googleClientSecretPresent,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
