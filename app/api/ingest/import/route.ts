import { NextResponse } from "next/server";
import { requireWorkspaceContext } from "@/lib/auth/session";
import { rateLimitGuard } from "@/lib/security/guard";
import { importProjectFromUrl } from "@/lib/ingest/import";
import { IngestError } from "@/lib/ingest/errors";
import { createProjectSchema } from "@/lib/validations";
import { PlanLimitError } from "@/lib/billing/usage";
import { FFmpegUnavailableError } from "@/lib/ffmpeg";
import { newRequestId, publicErrorMessage } from "@/lib/observability/request-id";
import type { ClipMode } from "@/generated/prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(request: Request) {
  const requestId = newRequestId();
  const limited = await rateLimitGuard("ingest-import", 8, 60_000);
  if (limited) return NextResponse.json({ error: limited.error, requestId }, { status: 429 });
  const ctx = await requireWorkspaceContext();
  const json = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!json) return NextResponse.json({ error: "Dados inválidos.", requestId }, { status: 400 });
  const parsed = createProjectSchema.safeParse({
    name: json.name || "Novo projeto",
    sourceKind: json.sourceKind || "DIRECT_URL",
    sourceUrl: json.sourceUrl || json.url || "",
    language: json.language || "pt-BR",
    intervalSeconds: json.intervalSeconds || 0,
    clipDuration: json.clipDuration || "15-30",
    clipCount: json.clipCount || 5,
    mode: json.mode || "AUTOMATIC",
    detectSpeakers: json.detectSpeakers !== false,
    removeSilences: json.removeSilences !== false,
    autoReframe: json.autoReframe !== false,
    autoCaptions: json.autoCaptions !== false,
    viralScore: json.viralScore !== false,
    generateTitle: json.generateTitle !== false,
    generateDescription: json.generateDescription !== false,
    generateHashtags: json.generateHashtags !== false,
    authorized: json.authorized === true || json.authorized === "on",
    outputAspect: json.outputAspect || "9:16",
  });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Verifique os campos.", requestId }, { status: 400 });
  }
  try {
    const project = await importProjectFromUrl({
      workspaceId: ctx.workspace.id,
      url: String(parsed.data.sourceUrl),
      name: parsed.data.name,
      language: parsed.data.language,
      intervalSeconds: parsed.data.intervalSeconds,
      clipDuration: parsed.data.clipDuration,
      clipCount: parsed.data.clipCount,
      mode: parsed.data.mode as ClipMode,
      detectSpeakers: parsed.data.detectSpeakers,
      removeSilences: parsed.data.removeSilences,
      autoReframe: parsed.data.autoReframe,
      autoCaptions: parsed.data.autoCaptions,
      viralScore: parsed.data.viralScore,
      generateTitle: parsed.data.generateTitle,
      generateDescription: parsed.data.generateDescription,
      generateHashtags: parsed.data.generateHashtags,
      outputAspect: parsed.data.outputAspect,
    });
    return NextResponse.json({ projectId: project.id, requestId });
  } catch (error) {
    if (error instanceof PlanLimitError) {
      return NextResponse.json({ error: `${error.message} Ver planos em Configurações → Plano e uso.`, requestId }, { status: 400 });
    }
    if (error instanceof IngestError) {
      return NextResponse.json({ error: error.message, code: error.code, requestId }, { status: 400 });
    }
    if (error instanceof FFmpegUnavailableError) {
      return NextResponse.json({ error: "Não conseguimos processar seu vídeo agora. Tente novamente.", requestId }, { status: 503 });
    }
    if (error instanceof Error && error.message === "URL de ingestão bloqueada.") {
      return NextResponse.json({ error: error.message, code: "blocked", requestId }, { status: 400 });
    }
    return NextResponse.json(publicErrorMessage(error, requestId), { status: 500 });
  }
}
