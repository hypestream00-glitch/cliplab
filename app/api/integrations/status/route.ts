import { NextResponse } from "next/server";
import { requireWorkspaceContext } from "@/lib/auth/session";
import { getIntegrationsStatus } from "@/lib/integrations/status";
import { limitAction } from "@/lib/security/action-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export async function GET() {
  await requireWorkspaceContext();
  const limited = await limitAction("integrations-status", 30, 60_000);
  if (!limited.ok) {
    return NextResponse.json({ error: "rate-limit" }, { status: 429, headers: { "Cache-Control": "no-store" } });
  }
  const status = await getIntegrationsStatus();
  return NextResponse.json(status, { headers: { "Cache-Control": "no-store" } });
}
