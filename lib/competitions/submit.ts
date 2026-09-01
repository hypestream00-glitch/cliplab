import { prisma } from "@/lib/db/prisma";
import { isPrismaUniqueViolation } from "@/lib/webhooks/idempotency";
import { canSubmitStatus } from "@/lib/competitions/status";
import { isAllowedCompetitionPlatform } from "@/lib/competitions/platforms";
import { parseSocialPostUrl } from "@/lib/competitions/parse-url";
import { writeCompetitionAudit } from "@/lib/competitions/audit";

export async function createCompetitionSubmission(params: {
  competitionId: string;
  userId: string;
  workspaceId: string;
  socialAccountId: string;
  publicationId?: string | null;
  clipId?: string | null;
  postUrl?: string | null;
}) {
  const competition = await prisma.competition.findUnique({ where: { id: params.competitionId } });
  if (!competition) return { ok: false as const, error: "Campeonato não encontrado." };
  if (!canSubmitStatus(competition.status)) {
    return { ok: false as const, error: "Novas submissões só são aceitas enquanto o campeonato está ativo." };
  }
  const now = new Date();
  if (now < competition.startsAt || now > competition.endsAt) {
    return { ok: false as const, error: "A publicação está fora da janela do campeonato." };
  }

  const participant = await prisma.competitionParticipant.findUnique({
    where: { competitionId_userId: { competitionId: params.competitionId, userId: params.userId } },
  });
  if (!participant || participant.status !== "ACTIVE") {
    return { ok: false as const, error: "Você precisa participar deste campeonato." };
  }

  const account = await prisma.socialAccount.findFirst({
    where: {
      id: params.socialAccountId,
      workspaceId: params.workspaceId,
      mock: false,
      status: { in: ["CONNECTED", "TOKEN_EXPIRING"] },
    },
  });
  if (!account) return { ok: false as const, error: "Conta social desconectada." };
  if (!competition.allowedPlatforms.includes(account.platform) || !isAllowedCompetitionPlatform(account.platform)) {
    return { ok: false as const, error: "Essa plataforma não é permitida neste campeonato." };
  }

  let postExternalId = "";
  let postUrl = "";
  let publishedAt: Date | null = null;
  const publicationId: string | null = params.publicationId ?? null;
  let clipId: string | null = params.clipId ?? null;

  if (publicationId) {
    const publication = await prisma.socialPublication.findFirst({
      where: { id: publicationId, workspaceId: params.workspaceId },
      include: { targets: true },
    });
    if (!publication) return { ok: false as const, error: "Publicação não encontrada." };
    const target = publication.targets.find((item) => item.socialAccountId === account.id && item.externalPostId);
    if (!target?.externalPostId) {
      return { ok: false as const, error: "Essa publicação não pertence à conta conectada." };
    }
    postExternalId = target.externalPostId;
    postUrl = params.postUrl?.trim() || `https://cortaclip.com/studio/publishing`;
    publishedAt = target.publishedAt ?? publication.publishedAt;
    clipId = publication.clipId ?? clipId;
  } else {
    const parsed = parseSocialPostUrl(params.postUrl ?? "");
    if (!parsed) return { ok: false as const, error: "Cole uma URL válida do TikTok, Instagram ou YouTube." };
    if (parsed.platform !== account.platform) {
      return { ok: false as const, error: "Essa publicação não pertence à conta conectada." };
    }
    postExternalId = parsed.postExternalId;
    postUrl = parsed.postUrl;
  }

  if (publishedAt && (publishedAt < competition.startsAt || publishedAt > competition.endsAt)) {
    return { ok: false as const, error: "Essa publicação está fora da janela do campeonato." };
  }

  const used = await prisma.competitionSubmission.count({
    where: { participantId: participant.id, status: { notIn: ["REJECTED", "REMOVED"] } },
  });
  if (used >= competition.maxClipsPerParticipant) {
    return { ok: false as const, error: "Você atingiu o limite de clips deste campeonato." };
  }

  try {
    const submission = await prisma.competitionSubmission.create({
      data: {
        competitionId: params.competitionId,
        participantId: participant.id,
        userId: params.userId,
        workspaceId: params.workspaceId,
        socialAccountId: account.id,
        publicationId,
        clipId,
        platform: account.platform,
        postExternalId,
        postUrl,
        publishedAt,
        status: "PENDING",
      },
    });
    await writeCompetitionAudit({
      competitionId: params.competitionId,
      actorUserId: params.userId,
      action: "SUBMISSION_CREATED",
      entityType: "CompetitionSubmission",
      entityId: submission.id,
    });
    return { ok: true as const, submissionId: submission.id };
  } catch (error) {
    if (isPrismaUniqueViolation(error)) {
      return { ok: false as const, error: "Essa publicação já está participando." };
    }
    throw error;
  }
}
