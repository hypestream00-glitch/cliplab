import { NextResponse } from "next/server";
import { authenticateApiKey } from "@/lib/api/auth";
import { prisma } from "@/lib/db/prisma";
import { clampExportResolution } from "@/lib/config/plans";
import { getWorkspacePlanCode } from "@/lib/billing/usage";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const key = await authenticateApiKey(request);
  if (!key) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const clip = await prisma.clip.findFirst({ where: { id, workspaceId: key.workspaceId } });
  if (!clip) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const planCode = await getWorkspacePlanCode(key.workspaceId);
  const resolution = clampExportResolution(planCode, "1080p");
  const job = await prisma.renderJob.create({
    data: {
      workspaceId: key.workspaceId,
      clipId: clip.id,
      resolution,
      fps: 30,
      status: "WAITING",
    },
  });
  return NextResponse.json({ jobId: job.id, mocked: true, message: "Render enfileirado. Em modo de desenvolvimento não há arquivo real." });
}
