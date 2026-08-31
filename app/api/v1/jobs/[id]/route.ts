import { NextResponse } from "next/server";
import { authenticateApiKey } from "@/lib/api/auth";
import { prisma } from "@/lib/db/prisma";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const key = await authenticateApiKey(request);
  if (!key) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const job = await prisma.processingJob.findFirst({ where: { id, workspaceId: key.workspaceId } });
  if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(job);
}
