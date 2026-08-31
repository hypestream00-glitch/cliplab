import { NextResponse } from "next/server";
import { requireWorkspaceContext } from "@/lib/auth/session";
import { rateLimitGuard } from "@/lib/security/guard";
import {
  abortUploadSession,
  completeUploadSchema,
  completeUploadSession,
  getOwnedUploadSession,
  UploadSessionError,
} from "@/lib/uploads/session";
import { PlanLimitError } from "@/lib/billing/usage";
import { InvalidVideoError } from "@/lib/media/validate";
import { newRequestId, publicErrorMessage } from "@/lib/observability/request-id";
import { InsufficientCreditsError } from "@/lib/billing/credits";
import { FFmpegUnavailableError } from "@/lib/ffmpeg";
import { QueueUnavailableError } from "@/lib/queue";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireWorkspaceContext();
  const { id } = await params;
  try {
    const session = await getOwnedUploadSession(ctx.workspace.id, id);
    return NextResponse.json({
      uploadId: session.id,
      status: session.status,
      projectId: session.projectId,
      expiresAt: session.expiresAt.toISOString(),
      errorMessage: session.errorMessage,
    });
  } catch (error) {
    if (error instanceof UploadSessionError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const requestId = newRequestId();
  const limited = await rateLimitGuard("upload-complete", 20, 60_000);
  if (limited) return NextResponse.json({ error: limited.error, requestId }, { status: 429 });
  const ctx = await requireWorkspaceContext();
  const { id } = await params;
  const json = await request.json().catch(() => null);
  const parsed = completeUploadSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos.", requestId }, { status: 400 });
  }
  try {
    const result = await completeUploadSession({
      workspaceId: ctx.workspace.id,
      uploadId: id,
      project: parsed.data,
    });
    return NextResponse.json({ ...result, requestId });
  } catch (error) {
    if (error instanceof PlanLimitError || error instanceof InvalidVideoError || error instanceof InsufficientCreditsError) {
      return NextResponse.json({ error: error.message, requestId }, { status: 400 });
    }
    if (error instanceof FFmpegUnavailableError) {
      return NextResponse.json({ error: "Não conseguimos processar seu vídeo agora. Tente novamente.", requestId }, { status: 503 });
    }
    if (error instanceof QueueUnavailableError) {
      return NextResponse.json({ error: error.message, requestId }, { status: 503 });
    }
    if (error instanceof UploadSessionError) {
      return NextResponse.json({ error: error.message, requestId }, { status: error.status });
    }
    return NextResponse.json(publicErrorMessage(error, requestId), { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireWorkspaceContext();
  const { id } = await params;
  try {
    await abortUploadSession(ctx.workspace.id, id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof UploadSessionError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
