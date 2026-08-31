import { NextResponse } from "next/server";
import { authenticateApiKey } from "@/lib/api/auth";
import { prisma } from "@/lib/db/prisma";
import { visibleProjectWhere } from "@/lib/data/visibility";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const key = await authenticateApiKey(_request);
  if (!key) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const project = await prisma.project.findFirst({
    where: { id, ...visibleProjectWhere(key.workspaceId) },
    include: { sourceVideo: true },
  });
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(project);
}
