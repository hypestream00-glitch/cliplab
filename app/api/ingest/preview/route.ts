import { NextResponse } from "next/server";
import { requireWorkspaceContext } from "@/lib/auth/session";
import { rateLimitGuard } from "@/lib/security/guard";
import { previewProjectFromUrl } from "@/lib/ingest/import";
import { IngestError } from "@/lib/ingest/errors";
import { newRequestId, publicErrorMessage } from "@/lib/observability/request-id";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const requestId = newRequestId();
  const limited = await rateLimitGuard("ingest-preview", 20, 60_000);
  if (limited) return NextResponse.json({ error: limited.error, requestId }, { status: 429 });
  await requireWorkspaceContext();
  const json = (await request.json().catch(() => null)) as { url?: string } | null;
  const url = typeof json?.url === "string" ? json.url : "";
  try {
    const preview = await previewProjectFromUrl(url);
    return NextResponse.json({ preview, requestId });
  } catch (error) {
    if (error instanceof IngestError) {
      return NextResponse.json({ error: error.message, code: error.code, requestId }, { status: 400 });
    }
    if (error instanceof Error && error.message === "URL de ingestão bloqueada.") {
      return NextResponse.json({ error: error.message, code: "blocked", requestId }, { status: 400 });
    }
    return NextResponse.json(publicErrorMessage(error, requestId), { status: 500 });
  }
}
