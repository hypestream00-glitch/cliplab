import { NextResponse } from "next/server";
import { authenticateApiKey } from "@/lib/api/auth";
import { prisma } from "@/lib/db/prisma";
import { visibleClipWhere, visibleProjectWhere } from "@/lib/data/visibility";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const key = await authenticateApiKey(request);
  if (!key) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const project = await prisma.project.findFirst({ where: { id, ...visibleProjectWhere(key.workspaceId) } });
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const clips = await prisma.clip.findMany({
    where: { projectId: id, ...visibleClipWhere(key.workspaceId) },
    include: { score: true },
  });
  return NextResponse.json({ clips });
}
