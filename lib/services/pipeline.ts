import { prisma } from "@/lib/db/prisma";
import { consumeCredits, InsufficientCreditsError } from "@/lib/billing/credits";
import { creditsForDurationMs } from "@/lib/billing/pricing";
import { getStorage, randomStorageKey } from "@/lib/storage";
import { withJobTempDir, materializeObject, localOutputPath, commitLocalFile } from "@/lib/storage/materialize";
import { toDbJobStatus } from "@/lib/jobs/status";
import {
  cutClip,
  extractAudio,
  extractThumbnail,
  FFmpegUnavailableError,
  isFfmpegAvailable,
  probeVideo,
} from "@/lib/ffmpeg";
import { getTranscriptionProvider, type TranscriptionResult } from "@/lib/transcription";
import { detectClips } from "@/lib/services/clip-detection";
import { getProcessingCapabilities } from "@/lib/media/capabilities";
import { analysisInputHash, fileIdentityHash } from "@/lib/media/hash";
import { formatCaptions } from "@/lib/captions/format";
import { logger } from "@/lib/logger";
import { ffmpegMaxDurationMs } from "@/lib/ffmpeg/limits";
import { analysisCreditKey } from "@/lib/webhooks/idempotency";
import { notifyWorkspace } from "@/lib/services/notifications";
import { sanitizePublicError } from "@/lib/ai/policy";
import { OpenAiHttpError } from "@/lib/ai/openai-error";
import { clampClipDurationRange } from "@/lib/config/clip-score";
import type { Prisma, ProjectStatus } from "@/generated/prisma/client";

async function setProgress(projectId: string, status: ProjectStatus, progress: number, message: string) {
  await prisma.project.update({ where: { id: projectId }, data: { status } });
  await prisma.processingJob.updateMany({
    where: { entityId: projectId, type: "VIDEO_IMPORT" },
    data: {
      status: status === "READY" ? "COMPLETED" : status === "FAILED" ? "FAILED" : toDbJobStatus("PROCESSING"),
      progress,
      message,
      startedAt: new Date(),
      finishedAt: status === "READY" || status === "FAILED" ? new Date() : null,
    },
  });
}

function requireKey(key: string | null | undefined, label: string) {
  if (!key) throw new Error(`${label} sem arquivo no storage.`);
  return key;
}

export async function processProjectPipeline(projectId: string) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      sourceVideo: true,
      transcript: { include: { segments: { orderBy: { startMs: "asc" } } } },
      clips: { include: { score: true } },
    },
  });
  if (!project || !project.sourceVideo) return;

  const caps = await getProcessingCapabilities();
  let existingClips = project.clips;
  const fail = async (error: unknown) => {
    const message = sanitizePublicError(error instanceof Error ? error.message : "Falha no processamento");
    const openaiError =
      error instanceof OpenAiHttpError
        ? { status: error.status, type: error.type, code: error.code, kind: error.kind }
        : undefined;
    logger.error({ err: error, projectId, openaiError }, "pipeline failed");
    await prisma.project.update({
      where: { id: projectId },
      data: {
        status: "FAILED",
        errorMessage: message,
        pipelineMeta: { ...caps, error: message, openaiError } as Prisma.InputJsonValue,
      },
    });
    await prisma.processingJob.updateMany({
      where: { entityId: projectId },
      data: { status: "FAILED", errorMessage: message, finishedAt: new Date() },
    });
    await notifyWorkspace({
      workspaceId: project.workspaceId,
      type: "PROCESSING_FAILED",
      title: "Processamento falhou",
      body: `${project.name}: ${message}`,
      entityType: "Project",
      entityId: projectId,
    });
  };

  try {
    if (!(await isFfmpegAvailable())) {
      throw new FFmpegUnavailableError();
    }

    await withJobTempDir(async (tmp) => {
    const sourceVideo = project.sourceVideo!;
    await setProgress(projectId, "PROBING", 8, "Processando vídeo");
    const sourceKey = requireKey(sourceVideo.storageKey, "Vídeo de origem");
    const inputPath = await materializeObject(sourceKey, tmp, "source-video");
    const probe = await probeVideo(inputPath);
    if (probe.durationMs > ffmpegMaxDurationMs()) {
      throw new Error(`Duração (${Math.round(probe.durationMs / 1000)}s) excede o limite operacional do FFmpeg.`);
    }

    const subscription = await prisma.subscription.findUnique({
      where: { workspaceId: project.workspaceId },
      include: { plan: true },
    });
    const { getPlanLimits } = await import("@/lib/config/plans");
    const { assertMinutesAvailable, recordProcessingUsage, PlanLimitError } = await import("@/lib/billing/usage");
    const { getAvailableCredits } = await import("@/lib/billing/credits");
    const limits = getPlanLimits(subscription?.plan.code ?? "FREE");
    if (probe.durationMs / 1000 > limits.maxVideoDurationSeconds) {
      throw new PlanLimitError("Este vídeo ultrapassa a duração máxima do seu plano.");
    }
    await assertMinutesAvailable(project.workspaceId, probe.durationMs, project.id);
    await recordProcessingUsage({
      workspaceId: project.workspaceId,
      projectId: project.id,
      durationMs: probe.durationMs,
    });

    if (!project.creditsUsed) {
      const amount = creditsForDurationMs(probe.durationMs);
      const available = await getAvailableCredits(project.workspaceId);
      if (available >= amount) {
        await consumeCredits({
          workspaceId: project.workspaceId,
          amount,
          type: "VIDEO_ANALYSIS",
          description: `Análise de ${project.name} (${amount} min reais)`,
          idempotencyKey: analysisCreditKey(project.id),
          reference: project.id,
        });
        await prisma.project.update({ where: { id: project.id }, data: { creditsUsed: amount } });
      }
    }

    await prisma.sourceVideo.update({
      where: { id: sourceVideo.id },
      data: {
        durationMs: probe.durationMs,
        width: probe.width,
        height: probe.height,
        fps: probe.fps,
        codec: probe.codec,
        audioCodec: probe.audioCodec,
        bitrate: probe.bitrate,
      },
    });

    await setProgress(projectId, "PROBING", 16, "Processando vídeo");
    if (!sourceVideo.thumbnailKey || !(await getStorage().exists(sourceVideo.thumbnailKey))) {
      const thumbKey = randomStorageKey("thumb.jpg", `thumbs/${project.workspaceId}`);
      const thumbPath = await localOutputPath(thumbKey, tmp, "thumb.jpg");
      await extractThumbnail(inputPath, thumbPath, Math.min(1000, Math.floor(probe.durationMs / 4)));
      await commitLocalFile(thumbPath, thumbKey, "image/jpeg");
      const thumbStat = await getStorage().stat(thumbKey);
      if (!thumbStat.size) throw new Error("Thumbnail vazia.");
      await prisma.sourceVideo.update({
        where: { id: sourceVideo.id },
        data: { thumbnailKey: thumbKey },
      });
    }

    let audioPath: string | undefined;
    if (probe.audioCodec) {
      await setProgress(projectId, "AUDIO_EXTRACTING", 24, "Extraindo áudio");
      if (sourceVideo.audioStorageKey && (await getStorage().exists(sourceVideo.audioStorageKey))) {
        audioPath = await materializeObject(requireKey(sourceVideo.audioStorageKey, "Áudio"), tmp, "audio.mp3");
      } else {
        const audioKey = randomStorageKey("audio.mp3", `audio/${project.workspaceId}`);
        audioPath = await localOutputPath(audioKey, tmp, "audio.mp3");
        await extractAudio(inputPath, audioPath);
        await commitLocalFile(audioPath, audioKey, "audio/mpeg");
        await prisma.sourceVideo.update({
          where: { id: sourceVideo.id },
          data: { audioStorageKey: audioKey },
        });
      }
    }

    if (!probe.audioCodec || !audioPath) {
      throw new Error("Este vídeo não tem faixa de áudio. A transcrição real precisa do áudio extraído do arquivo enviado.");
    }
    const transcriptProvider = getTranscriptionProvider();
    if (transcriptProvider.mocked) {
      throw new Error("OPENAI_API_KEY ausente. Novos projetos não usam transcrição MOCK.");
    }
    const audioHash = await fileIdentityHash(audioPath);
    const existingTranscript = project.transcript;
    const expectedProvider = transcriptProvider.providerLabel;
    const canReuseTranscript =
      Boolean(existingTranscript?.segments.length) &&
      existingTranscript?.provider === expectedProvider &&
      existingTranscript?.provider !== "MOCK" &&
      existingTranscript?.sourceHash === audioHash;

    let transcriptData: TranscriptionResult = {
      fullText: existingTranscript?.fullText ?? "",
      segments: (existingTranscript?.segments ?? []).map((segment) => ({
        startMs: segment.startMs,
        endMs: segment.endMs,
        text: segment.text,
        speakerId: segment.speakerId ?? undefined,
        confidence: segment.confidence ?? undefined,
        words: (segment.words as Array<{ startMs: number; endMs: number; text: string }> | null) ?? undefined,
      })),
      provider: (existingTranscript?.provider as "OPENAI" | "MOCK") ?? transcriptProvider.providerLabel,
      model: existingTranscript?.model ?? undefined,
    };

    if (!canReuseTranscript) {
      await setProgress(projectId, "TRANSCRIBING", 40, "Transcrevendo");
      transcriptData = await transcriptProvider.transcribe({
        durationMs: probe.durationMs,
        language: project.language,
        audioPath,
      });
      if (transcriptData.provider === "MOCK") {
        throw new Error("A transcrição retornou MOCK. Novos projetos exigem OpenAI real.");
      }
      await prisma.transcript.deleteMany({ where: { projectId } });
      await prisma.transcript.create({
        data: {
          projectId,
          language: transcriptData.language ?? project.language,
          fullText: transcriptData.fullText,
          provider: transcriptData.provider,
          model: transcriptData.model ?? (transcriptData.provider === "OPENAI" ? "whisper-1" : "mock"),
          sourceHash: audioHash,
          segments: {
            create: transcriptData.segments.map((segment) => ({
              projectId,
              startMs: segment.startMs,
              endMs: Math.min(probe.durationMs, segment.endMs),
              text: segment.text,
              speakerId: segment.speakerId,
              confidence: segment.confidence,
              words: segment.words ? (segment.words as Prisma.InputJsonValue) : undefined,
            })),
          },
        },
      });
    } else {
      await setProgress(projectId, "TRANSCRIBING", 40, "Transcrição válida reutilizada");
    }

    const clipRange = clampClipDurationRange(project.clipDurationMin, project.clipDurationMax, probe.durationMs / 1000);
    const nextAnalysisHash = analysisInputHash({
      provider: transcriptProvider.providerLabel,
      fullText: transcriptData.fullText,
      clipCount: project.clipCount,
      clipDurationMin: clipRange.minSec,
      clipDurationMax: clipRange.maxSec,
      mode: project.mode,
    });
    const meta = (project.pipelineMeta as Record<string, unknown> | null) ?? {};
    const canReuseAnalysis =
      meta.analysisInputHash === nextAnalysisHash &&
      project.clips.length > 0 &&
      String(meta.analysisProvider ?? "") === "OPENAI";

    let analyzed = project.clips.map((clip) => ({
      startMs: clip.startMs,
      endMs: clip.endMs,
      title: clip.title,
      summary: clip.summary ?? "",
      reason: clip.reason ?? "",
      score: clip.score?.overall ?? 50,
      hookScore: clip.score?.hookScore ?? 50,
      retentionScore: clip.score?.retentionScore ?? 50,
      clarityScore: clip.score?.clarityScore ?? 50,
      emotionScore: clip.score?.emotionScore ?? 50,
      shareabilityScore: clip.score?.shareabilityScore ?? 50,
      suggestedCaption: clip.suggestedCaption ?? "",
      suggestedHashtags: clip.hashtags,
      mocked: transcriptProvider.mocked,
    }));
    let analysisProviderLabel: "OPENAI" | "MOCK" = transcriptProvider.mocked ? "MOCK" : "OPENAI";
    let analysisModel: string | undefined;
    let analysisUsage: { promptTokens?: number; completionTokens?: number; totalTokens?: number } | undefined;

    if (!canReuseAnalysis) {
      await setProgress(projectId, "ANALYZING", 55, "Analisando conteúdo");
      await setProgress(projectId, "ANALYZING", 62, "Encontrando melhores momentos");
      const detected = await detectClips({
        input: {
          language: project.language,
          durationMs: probe.durationMs,
          segments: transcriptData.segments,
          metadata: { projectId, mode: project.mode, mocked: false },
        },
        durationMs: probe.durationMs,
        clipCount: Math.min(project.clipCount, limits.maxClipsPerProject),
        clipDurationMin: clipRange.minSec,
        clipDurationMax: clipRange.maxSec,
      });
      if (detected.provider.mocked || detected.provider.providerLabel === "MOCK") {
        throw new Error("A análise retornou MOCK. Novos projetos exigem análise OpenAI real.");
      }
      analysisProviderLabel = detected.provider.providerLabel;
      analysisModel = detected.model;
      analysisUsage = detected.usage;
      analyzed = detected.clips;
      await prisma.clip.deleteMany({ where: { projectId } });
      existingClips = [];
    } else {
      await setProgress(projectId, "ANALYZING", 58, "Análise válida reutilizada");
      analysisProviderLabel = String(meta.analysisProvider ?? analysisProviderLabel) === "OPENAI" ? "OPENAI" : "MOCK";
    }

    await setProgress(projectId, "CLIPPING", 70, "Gerando clips");
    const readyClips: Array<{ id: string; storageKey: string | null }> = [];
    for (const [index, candidate] of analyzed.entries()) {
      let clip: { id: string; storageKey: string | null } | undefined = existingClips.find(
        (item) => item.startMs === candidate.startMs && item.endMs === candidate.endMs,
      );
      if (!clip) {
        clip = await prisma.clip.create({
          data: {
            workspaceId: project.workspaceId,
            projectId,
            title: candidate.title,
            summary: candidate.summary,
            reason: candidate.reason,
            startMs: candidate.startMs,
            endMs: candidate.endMs,
            durationMs: candidate.endMs - candidate.startMs,
            status: "CANDIDATE",
            description: candidate.summary,
            suggestedCaption: candidate.suggestedCaption,
            hashtags: candidate.suggestedHashtags ?? [],
          },
        });
        await prisma.clipScore.create({
          data: {
            clipId: clip.id,
            overall: candidate.score,
            hookScore: candidate.hookScore,
            retentionScore: candidate.retentionScore,
            clarityScore: candidate.clarityScore,
            emotionScore: candidate.emotionScore,
            shareabilityScore: candidate.shareabilityScore ?? 50,
          },
        });
      }

      if (!clip.storageKey || !(await getStorage().exists(clip.storageKey))) {
        const clipKey = randomStorageKey(`clip-${index}.mp4`, `clips/${project.workspaceId}`);
        const clipThumbKey = randomStorageKey(`clip-${index}.jpg`, `clips/${project.workspaceId}/thumbs`);
        const clipPath = await localOutputPath(clipKey, tmp, `clip-${index}.mp4`);
        const clipThumbPath = await localOutputPath(clipThumbKey, tmp, `clip-${index}.jpg`);
        await cutClip({
          inputPath,
          outputPath: clipPath,
          startMs: candidate.startMs,
          endMs: candidate.endMs,
        });
        await extractThumbnail(clipPath, clipThumbPath, 400);
        await commitLocalFile(clipPath, clipKey, "video/mp4");
        await commitLocalFile(clipThumbPath, clipThumbKey, "image/jpeg");
        const info = await probeVideo(clipPath);
        const file = await getStorage().stat(clipKey);
        clip = await prisma.clip.update({
          where: { id: clip.id },
          data: {
            storageKey: clipKey,
            thumbnailKey: clipThumbKey,
            width: info.width,
            height: info.height,
            sizeBytes: file.size,
            durationMs: info.durationMs,
            status: "READY",
          },
        });
      } else {
        clip = await prisma.clip.update({
          where: { id: clip.id },
          data: { status: "READY" },
        });
      }
      if (!clip.storageKey || !(await getStorage().exists(clip.storageKey))) {
        throw new Error("O MP4 do clipe não foi gerado. O player precisa do arquivo físico.");
      }
      readyClips.push(clip);
      await setProgress(projectId, "CLIPPING", 70 + Math.round((index / Math.max(1, analyzed.length)) * 16), `Gerando clips ${index + 1}/${analyzed.length}`);
    }

    await setProgress(projectId, "CLIPPING", 90, "Preparando legendas");
    formatCaptions(transcriptData.segments, { maxWordsPerLine: 6, maxCharactersPerLine: 32, maxLines: 2 });

    await prisma.project.update({
      where: { id: projectId },
      data: {
        pipelineMeta: {
          video: "REAL",
          clipping: "REAL",
          render: "REAL",
          transcription: transcriptData.provider === "MOCK" ? "MOCK" : "REAL",
          transcriptionProvider: transcriptData.provider,
          transcriptionModel: transcriptData.model ?? null,
          transcriptionUsage: transcriptData.usage ?? null,
          analysis: analysisProviderLabel === "OPENAI" ? "REAL" : "MOCK",
          analysisProvider: analysisProviderLabel,
          analysisModel: analysisModel ?? null,
          analysisUsage: analysisUsage ?? null,
          analysisInputHash: nextAnalysisHash,
          ffmpeg: true,
          stage: "READY",
        } as Prisma.InputJsonValue,
      },
    });

    const owner = await prisma.workspaceMember.findFirst({
      where: { workspaceId: project.workspaceId, role: "OWNER" },
    });
    if (owner) {
      await notifyWorkspace({
        workspaceId: project.workspaceId,
        type: "CLIPS_READY",
        title: "Clipes prontos",
        body: `${readyClips.length} clipes gerados para ${project.name}.`,
        entityType: "Project",
        entityId: project.id,
      });
    }

    await setProgress(projectId, "READY", 100, "Finalizado");
    });
  } catch (error) {
    if (error instanceof InsufficientCreditsError) {
      await fail(new Error("Créditos insuficientes para a duração real deste vídeo."));
      return;
    }
    await fail(error);
  }
}
