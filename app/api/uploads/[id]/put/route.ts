import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { NextResponse } from "next/server";
import { requireWorkspaceContext } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { getStorage } from "@/lib/storage";
import { directObjectUploadEnabled, isUploadExpired } from "@/lib/uploads/policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireWorkspaceContext();
  const { id } = await params;
  if (directObjectUploadEnabled()) {
    return NextResponse.json({ error: "Use a URL assinada do storage." }, { status: 400 });
  }
  const session = await prisma.uploadSession.findFirst({
    where: { id, workspaceId: ctx.workspace.id },
  });
  if (!session) return NextResponse.json({ error: "Upload não encontrado." }, { status: 404 });
  if (session.projectId) return NextResponse.json({ error: "Upload já concluído." }, { status: 409 });
  if (isUploadExpired(session.expiresAt)) {
    return NextResponse.json({ error: "Upload expirado." }, { status: 410 });
  }
  if (!request.body) return NextResponse.json({ error: "Corpo vazio." }, { status: 400 });

  const storage = getStorage();
  const output = await storage.createWriteStream(session.storageKey);
  await pipeline(Readable.fromWeb(request.body as import("node:stream/web").ReadableStream), output);
  await prisma.uploadSession.update({
    where: { id: session.id },
    data: { status: "UPLOADING" },
  });
  return NextResponse.json({ ok: true });
}
