"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { createCompetition } from "@/lib/competitions/admin";
import { writeCompetitionAudit } from "@/lib/competitions/audit";
import { finalizeCompetition } from "@/lib/competitions/finalize";
import type { CompetitionPrizeMode, CompetitionStatus, CompetitionSubmissionStatus, CompetitionPayoutStatus } from "@/generated/prisma/client";
import type { PrizeRuleInput } from "@/lib/competitions/prizes";
import { computeTrendScore } from "@/lib/trending/score";

function reaisToCents(value: string) {
  const n = Number(String(value).replace(",", "."));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

function parseRankingRules(raw: string): PrizeRuleInput[] {
  return raw
    .split(/[;\n,]/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part, index) => {
      const [position, amount] = part.split(":");
      return {
        kind: "RANKING_POSITION",
        position: Number(position),
        amountCents: reaisToCents(amount ?? "0"),
        sortOrder: index,
      };
    })
    .filter((rule) => Number.isFinite(rule.position) && (rule.position ?? 0) > 0);
}

function parseViewsTiers(raw: string): PrizeRuleInput[] {
  return raw
    .split(/[;\n,]/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part, index) => {
      const [views, amount] = part.split(":");
      return {
        kind: "VIEWS_TIER",
        viewsRequired: Number(views),
        amountCents: reaisToCents(amount ?? "0"),
        sortOrder: 100 + index,
      };
    })
    .filter((rule) => Number.isFinite(rule.viewsRequired) && (rule.viewsRequired ?? 0) > 0);
}

export async function adminCreateCompetitionAction(formData: FormData) {
  const admin = await requireAdmin();
  const prizeMode = String(formData.get("prizeMode") ?? "RANKING") as CompetitionPrizeMode;
  const rankingRules = parseRankingRules(String(formData.get("rankingRules") ?? ""));
  const viewsPer = Number(formData.get("viewsPerUnit") ?? 0);
  const amountPer = reaisToCents(String(formData.get("amountPerUnit") ?? "0"));
  const rules: PrizeRuleInput[] = [...rankingRules, ...parseViewsTiers(String(formData.get("viewsTiers") ?? ""))];
  if (viewsPer > 0 && amountPer > 0) {
    rules.push({ kind: "VIEWS_PER", viewsPerUnit: viewsPer, amountPerUnitCents: amountPer, amountCents: 0 });
  }
  const hashtags = String(formData.get("requiredHashtags") ?? "")
    .split(/[\s,]+/)
    .map((item) => item.trim())
    .filter(Boolean);
  const result = await createCompetition({
    actorUserId: admin.id,
    name: String(formData.get("name") ?? ""),
    description: String(formData.get("description") ?? "") || undefined,
    bannerUrl: String(formData.get("bannerUrl") ?? "") || undefined,
    prizePoolCents: reaisToCents(String(formData.get("prizePool") ?? "0")),
    prizeMode,
    rankingBudgetCents: reaisToCents(String(formData.get("rankingBudget") ?? "0")),
    viewsBudgetCents: reaisToCents(String(formData.get("viewsBudget") ?? "0")),
    startsAt: new Date(String(formData.get("startsAt") ?? "")),
    endsAt: new Date(String(formData.get("endsAt") ?? "")),
    allowedPlatforms: formData.getAll("platforms").map(String),
    maxClipsPerParticipant: Number(formData.get("maxClips") ?? 20),
    rules: String(formData.get("rules") ?? "") || undefined,
    requiredHashtags: hashtags,
    requiredText: String(formData.get("requiredText") ?? "") || undefined,
    status: (String(formData.get("status") ?? "DRAFT") as CompetitionStatus) || "DRAFT",
    prizeRules: rules,
  });
  if (!result.ok) redirect(`/admin/competitions/new?error=${encodeURIComponent(result.error)}`);
  redirect(`/admin/competitions/${result.id}`);
}

export async function adminUpdateSubmissionAction(formData: FormData) {
  const admin = await requireAdmin();
  const id = String(formData.get("submissionId") ?? "");
  const status = String(formData.get("status") ?? "") as CompetitionSubmissionStatus;
  const note = String(formData.get("note") ?? "");
  const submission = await prisma.competitionSubmission.update({
    where: { id },
    data: {
      status,
      rejectReason: status === "REJECTED" ? note || "Rejeitado pelo admin" : undefined,
      flagReason: status === "FLAGGED" ? note || "Marcado para revisão" : undefined,
    },
  });
  await writeCompetitionAudit({
    competitionId: submission.competitionId,
    actorUserId: admin.id,
    action: status === "REJECTED" ? "ADMIN_REJECTED_SUBMISSION" : "ADMIN_UPDATED_SUBMISSION",
    entityType: "CompetitionSubmission",
    entityId: submission.id,
    metadata: { status, note },
  });
  revalidatePath(`/admin/competitions/${submission.competitionId}`);
}

export async function adminUpdatePayoutAction(formData: FormData) {
  const admin = await requireAdmin();
  const id = String(formData.get("payoutId") ?? "");
  const status = String(formData.get("status") ?? "") as CompetitionPayoutStatus;
  const payout = await prisma.competitionPayout.update({
    where: { id },
    data: { status, note: String(formData.get("note") ?? "") || undefined },
  });
  await writeCompetitionAudit({
    competitionId: payout.competitionId,
    actorUserId: admin.id,
    action: "ADMIN_CHANGED_PAYOUT",
    entityType: "CompetitionPayout",
    entityId: payout.id,
    metadata: { status },
  });
  revalidatePath(`/admin/competitions/${payout.competitionId}`);
}

export async function adminFinalizeCompetitionAction(formData: FormData) {
  const admin = await requireAdmin();
  const id = String(formData.get("competitionId") ?? "");
  await finalizeCompetition(id, admin.id);
  revalidatePath(`/admin/competitions/${id}`);
}

export async function adminAddOfficialSourceAction(formData: FormData) {
  const admin = await requireAdmin();
  const competitionId = String(formData.get("competitionId") ?? "");
  const source = await prisma.competitionOfficialSource.create({
    data: {
      competitionId,
      title: String(formData.get("title") ?? "").trim() || "Vídeo oficial",
      projectId: String(formData.get("projectId") ?? "") || null,
      sourceUrl: String(formData.get("sourceUrl") ?? "") || null,
    },
  });
  await writeCompetitionAudit({
    competitionId,
    actorUserId: admin.id,
    action: "ADMIN_ADDED_OFFICIAL_SOURCE",
    entityType: "CompetitionOfficialSource",
    entityId: source.id,
  });
  revalidatePath(`/admin/competitions/${competitionId}`);
}

export async function adminDisqualifyParticipantAction(formData: FormData) {
  const admin = await requireAdmin();
  const id = String(formData.get("participantId") ?? "");
  const participant = await prisma.competitionParticipant.update({
    where: { id },
    data: {
      status: "DISQUALIFIED",
      disqualifiedAt: new Date(),
      disqualifyReason: String(formData.get("note") ?? "") || "Desclassificado pelo admin",
    },
  });
  await writeCompetitionAudit({
    competitionId: participant.competitionId,
    actorUserId: admin.id,
    action: "ADMIN_DISQUALIFIED_PARTICIPANT",
    entityType: "CompetitionParticipant",
    entityId: participant.id,
    metadata: { note: String(formData.get("note") ?? "") },
  });
  revalidatePath(`/admin/competitions/${participant.competitionId}`);
}

export async function adminCreateTrendingItemAction(formData: FormData) {
  await requireAdmin();
  const viewCountRaw = String(formData.get("viewCount") ?? "").trim();
  const viewCount = viewCountRaw ? Number(viewCountRaw) : null;
  const publishedAt = formData.get("publishedAt") ? new Date(String(formData.get("publishedAt"))) : null;
  const item = await prisma.trendingItem.create({
    data: {
      platform: String(formData.get("platform") ?? "YOUTUBE"),
      category: String(formData.get("category") ?? "Outros"),
      title: String(formData.get("title") ?? "").trim(),
      creatorName: String(formData.get("creatorName") ?? "") || null,
      thumbnailUrl: String(formData.get("thumbnailUrl") ?? "") || null,
      canonicalUrl: String(formData.get("canonicalUrl") ?? "") || null,
      viewCount: Number.isFinite(viewCount) ? viewCount : null,
      source: "admin",
      projectId: String(formData.get("projectId") ?? "") || null,
      publishedAt,
    },
  });
  const computed = computeTrendScore({ viewCount: Number.isFinite(viewCount) ? viewCount : null, publishedAt });
  await prisma.trendingScore.create({
    data: {
      itemId: item.id,
      score: computed.score,
      computedAt: new Date(),
      inputs: computed.inputs,
    },
  });
  revalidatePath("/admin/trending");
  revalidatePath("/studio/trending");
}
