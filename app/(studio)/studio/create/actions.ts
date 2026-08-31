"use server";

import { Readable } from "node:stream";
import { redirect } from "next/navigation";
import { requireWorkspaceContext } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { createProject, storeUploadFile, UrlIngestNotSupportedError } from "@/lib/services/projects";
import { createProjectSchema } from "@/lib/validations";
import { InsufficientCreditsError } from "@/lib/billing/credits";
import { InvalidVideoError, validateUploadFile, looksLikeVideoContainer } from "@/lib/media/validate";
import { clampClipCount, getPlanLimits } from "@/lib/config/plans";
import { FFmpegUnavailableError, isFfmpegAvailable } from "@/lib/ffmpeg";
import { rateLimitGuard } from "@/lib/security/guard";
import { PlanLimitError, getMonthlyUsage } from "@/lib/billing/usage";
import type { ClipMode, SourceKind } from "@/generated/prisma/client";

function nameFromSource(name: string, sourceUrl: string, filename?: string) {
  const trimmed = name.trim();
  if (trimmed && trimmed !== "Novo projeto") return trimmed;
  if (filename) return filename.replace(/\.[^.]+$/, "").slice(0, 80) || "Novo projeto";
  try {
    const url = new URL(sourceUrl);
    const host = url.hostname.replace(/^www\./, "");
    const path = url.pathname === "/" ? "" : url.pathname.replace(/\/$/, "");
    return `${host}${path}`.slice(0, 80) || "Novo projeto";
  } catch {
    return trimmed || "Novo projeto";
  }
}

export async function createProjectAction(_prev: unknown, formData: FormData) {
  const limited = await rateLimitGuard("upload", 12, 60_000);
  if (limited) return limited;
  const ctx = await requireWorkspaceContext();
  const authorized = formData.get("authorized") === "on" || formData.get("authorized") === "true";
  const sourceKind = String(formData.get("sourceKind") || "UPLOAD") as SourceKind;
  const sourceUrl = String(formData.get("sourceUrl") || "");
  const file = formData.get("file");
  const filename = file instanceof File ? file.name : undefined;
  const parsed = createProjectSchema.safeParse({
    name: nameFromSource(String(formData.get("name") ?? ""), sourceUrl, filename),
    sourceKind,
    sourceUrl,
    language: formData.get("language") || "pt-BR",
    intervalSeconds: formData.get("intervalSeconds") || 0,
    clipDuration: formData.get("clipDuration") || "15-30",
    clipCount: formData.get("clipCount") || 5,
    mode: formData.get("mode") || "AUTOMATIC",
    detectSpeakers: formData.get("detectSpeakers") === "on",
    removeSilences: formData.get("removeSilences") === "on",
    autoReframe: formData.get("autoReframe") === "on",
    autoCaptions: formData.get("autoCaptions") === "on",
    viralScore: formData.get("viralScore") === "on",
    generateTitle: formData.get("generateTitle") === "on",
    generateDescription: formData.get("generateDescription") === "on",
    generateHashtags: formData.get("generateHashtags") === "on",
    authorized: authorized ? true : undefined,
    outputAspect: formData.get("outputAspect") || "9:16",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Verifique os campos." };
  }

  try {
    if (!(await isFfmpegAvailable())) {
      throw new FFmpegUnavailableError();
    }
    if (parsed.data.sourceKind !== "UPLOAD") {
      throw new UrlIngestNotSupportedError();
    }
    if (!(file instanceof File) || file.size <= 0) {
      throw new InvalidVideoError("Selecione um arquivo MP4, MOV ou WEBM.");
    }
    const { directObjectUploadEnabled } = await import("@/lib/uploads/policy");
    if (directObjectUploadEnabled()) {
      throw new InvalidVideoError("Envie o vídeo pela página Criar clips (upload direto ao storage).");
    }
    const subscription = await prisma.subscription.findUnique({
      where: { workspaceId: ctx.workspace.id },
      include: { plan: true },
    });
    const limits = getPlanLimits(subscription?.plan.code ?? "FREE");
    const usage = await getMonthlyUsage(ctx.workspace.id);
    if (usage.remainingSeconds <= 0) {
      throw new PlanLimitError("Você atingiu o limite do seu plano.");
    }
    const clipCount = clampClipCount(subscription?.plan.code ?? "FREE", parsed.data.clipCount);
    const validated = validateUploadFile({
      filename: file.name,
      mimeType: file.type,
      sizeBytes: file.size,
      maxBytes: limits.maxFileSizeBytes,
    });
    const header = Buffer.from(await file.slice(0, 16).arrayBuffer());
    if (!looksLikeVideoContainer(header)) {
      throw new InvalidVideoError("O conteúdo do arquivo não parece um contêiner de vídeo válido.");
    }
    const stream = Readable.fromWeb(file.stream() as import("node:stream/web").ReadableStream);
    const storageKey = await storeUploadFile({
      workspaceId: ctx.workspace.id,
      filename: file.name,
      mimeType: validated.mime,
      stream,
    });
    const project = await createProject({
      workspaceId: ctx.workspace.id,
      name: parsed.data.name,
      sourceKind: "UPLOAD",
      originalName: file.name,
      storageKey,
      mimeType: validated.mime,
      sizeBytes: file.size,
      language: parsed.data.language,
      intervalSeconds: parsed.data.intervalSeconds,
      clipDuration: parsed.data.clipDuration,
      clipCount,
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
    redirect(`/studio/projects/${project.id}`);
  } catch (error) {
    if (error instanceof PlanLimitError) {
      return { error: `${error.message} Ver planos em Configurações → Plano e uso.` };
    }
    if (error instanceof InsufficientCreditsError) {
      return { error: "Créditos insuficientes para processar este vídeo." };
    }
    if (error instanceof UrlIngestNotSupportedError || error instanceof InvalidVideoError) {
      return { error: error.message };
    }
    if (error instanceof FFmpegUnavailableError) {
      return { error: "Não conseguimos processar seu vídeo agora. Tente novamente." };
    }
    throw error;
  }
}
