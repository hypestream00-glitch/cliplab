import { NextResponse } from "next/server";
import { requireWorkspaceContext } from "@/lib/auth/session";
import { rateLimitGuard } from "@/lib/security/guard";
import { initUploadSchema, initUploadSession, UploadSessionError } from "@/lib/uploads/session";
import { PlanLimitError } from "@/lib/billing/usage";
import { InvalidVideoError } from "@/lib/media/validate";
import { newRequestId, publicErrorMessage } from "@/lib/observability/request-id";

export async function POST(request: Request) {
  const requestId = newRequestId();
  const limited = await rateLimitGuard("upload-init", 12, 60_000);
  if (limited) return NextResponse.json({ error: limited.error, requestId }, { status: 429 });
  const ctx = await requireWorkspaceContext();
  const json = await request.json().catch(() => null);
  const parsed = initUploadSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos.", requestId }, { status: 400 });
  }
  try {
    const result = await initUploadSession({
      workspaceId: ctx.workspace.id,
      userId: ctx.user.id,
      filename: parsed.data.filename,
      contentType: parsed.data.contentType ?? "",
      fileSize: parsed.data.fileSize,
    });
    return NextResponse.json({ ...result, requestId });
  } catch (error) {
    if (error instanceof PlanLimitError || error instanceof InvalidVideoError) {
      return NextResponse.json({ error: error.message, requestId }, { status: 400 });
    }
    if (error instanceof UploadSessionError) {
      return NextResponse.json({ error: error.message, requestId }, { status: error.status });
    }
    return NextResponse.json(publicErrorMessage(error, requestId), { status: 500 });
  }
}
