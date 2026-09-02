import { NextResponse } from "next/server";
import { googleOAuthEnvReport, logGoogleOAuthEnvPresence } from "@/lib/env/server";
import { hydrateProcessEnvFromProc, procLookup } from "@/lib/env/proc-environ";
import { limitAction } from "@/lib/security/action-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

/** Runtime probe. Booleans/status only — never secret values. */
export async function GET() {
  const limited = await limitAction("oauth-env-check", 30, 60_000);
  if (!limited.ok) {
    return NextResponse.json({ error: "rate-limit" }, { status: 429, headers: { "Cache-Control": "no-store" } });
  }
  hydrateProcessEnvFromProc();
  logGoogleOAuthEnvPresence();
  const report = googleOAuthEnvReport();
  const procId = procLookup("GOOGLE_CLIENT_ID");
  return NextResponse.json(
    {
      runtime: report.runtime,
      nodeEnv: report.nodeEnv,
      googleClientIdPresent: report.googleClientIdPresent || procId.value.length > 0,
      googleClientSecretPresent: report.googleClientSecretPresent,
      googleOAuthConfigured: report.googleOAuthConfigured || (procId.value.length > 0 && report.googleClientSecretPresent),
      canonicalClientIdPresent: report.canonicalClientIdPresent || procId.value.length > 0,
      canonicalClientSecretPresent: report.canonicalClientSecretPresent,
      legacyClientIdPresent: report.legacyClientIdPresent,
      clientIdKeyFound: report.clientIdKeyFound || procId.keyFound,
      clientIdValueEmpty: report.clientIdValueEmpty && !procId.value,
      clientIdLookup: procId.value ? procId.kind : report.clientIdLookup,
      procEnvironAvailable: process.platform !== "win32",
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
