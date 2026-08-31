import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticateApiKey } from "@/lib/api/auth";
import { createProject } from "@/lib/services/projects";
import { clampClipCount } from "@/lib/config/plans";
import { getWorkspacePlanCode } from "@/lib/billing/usage";

const schema = z.object({
  name: z.string().min(2),
  sourceUrl: z.string().url().optional(),
  sourceKind: z.enum(["UPLOAD", "YOUTUBE", "TWITCH", "KICK", "GOOGLE_DRIVE", "DIRECT_URL"]).default("DIRECT_URL"),
});

export async function POST(request: Request) {
  const key = await authenticateApiKey(request);
  if (!key) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = schema.parse(await request.json());
  const planCode = await getWorkspacePlanCode(key.workspaceId);
  const project = await createProject({
    workspaceId: key.workspaceId,
    name: body.name,
    sourceKind: body.sourceKind,
    sourceUrl: body.sourceUrl,
    language: "pt-BR",
    intervalSeconds: 0,
    clipDuration: "15-30",
    clipCount: clampClipCount(planCode, 8),
    mode: "AUTOMATIC",
    detectSpeakers: true,
    removeSilences: true,
    autoReframe: true,
    autoCaptions: true,
    viralScore: true,
    generateTitle: true,
    generateDescription: true,
    generateHashtags: true,
  });
  return NextResponse.json({ id: project.id, status: project.status });
}
