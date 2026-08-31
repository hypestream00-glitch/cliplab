import { NextResponse } from "next/server";
import { requireWorkspaceContext } from "@/lib/auth/session";
import { runConnectionProbe, type ProbeTarget } from "@/lib/diagnostics/probes";
import { limitAction } from "@/lib/security/action-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  await requireWorkspaceContext();
  const limited = await limitAction("diagnostics", 10, 60_000);
  if (!limited.ok) {
    return NextResponse.json({ error: "Muitas tentativas" }, { status: 429 });
  }
  const body = (await request.json().catch(() => null)) as { target?: string } | null;
  const target = body?.target as ProbeTarget | undefined;
  if (!target || !["database", "storage", "redis", "openai", "upload-post", "smtp"].includes(target)) {
    return NextResponse.json({ error: "Alvo inválido" }, { status: 400 });
  }
  const result = await runConnectionProbe(target);
  return NextResponse.json(result);
}
