import { prisma } from "@/lib/db/prisma";
import { validatePrizeBudget, type PrizeRuleInput } from "@/lib/competitions/prizes";
import { slugifyCompetitionName } from "@/lib/competitions/status";
import { COMPETITION_PLATFORMS } from "@/lib/competitions/platforms";
import { writeCompetitionAudit } from "@/lib/competitions/audit";
import type { CompetitionPrizeMode, CompetitionStatus } from "@/generated/prisma/client";

export async function createCompetition(params: {
  actorUserId: string;
  name: string;
  description?: string;
  bannerUrl?: string;
  prizePoolCents: number;
  prizeMode: CompetitionPrizeMode;
  rankingBudgetCents: number;
  viewsBudgetCents: number;
  startsAt: Date;
  endsAt: Date;
  allowedPlatforms: string[];
  maxClipsPerParticipant: number;
  rules?: string;
  requiredHashtags?: string[];
  requiredText?: string;
  status?: CompetitionStatus;
  prizeRules: PrizeRuleInput[];
}) {
  if (!params.name.trim()) return { ok: false as const, error: "Informe o nome do campeonato." };
  if (Number.isNaN(params.startsAt.getTime()) || Number.isNaN(params.endsAt.getTime())) {
    return { ok: false as const, error: "Informe datas de início e fim válidas." };
  }
  if (params.endsAt.getTime() <= params.startsAt.getTime()) {
    return { ok: false as const, error: "A data final precisa ser depois do início." };
  }
  const platforms = params.allowedPlatforms.filter((item) => (COMPETITION_PLATFORMS as readonly string[]).includes(item));
  if (platforms.length === 0) return { ok: false as const, error: "Selecione ao menos uma plataforma permitida." };
  const rankingBudgetCents =
    params.prizeMode === "VIEWS" ? 0 : params.rankingBudgetCents || (params.prizeMode === "RANKING" ? params.prizePoolCents : 0);
  const viewsBudgetCents =
    params.prizeMode === "RANKING" ? 0 : params.viewsBudgetCents || (params.prizeMode === "VIEWS" ? params.prizePoolCents : 0);
  const budget = validatePrizeBudget(
    {
      prizePoolCents: params.prizePoolCents,
      prizeMode: params.prizeMode,
      rankingBudgetCents,
      viewsBudgetCents,
    },
    params.prizeRules,
  );
  if (!budget.ok) return budget;

  const base = slugifyCompetitionName(params.name);
  let slug = base;
  for (let i = 0; i < 8; i += 1) {
    const exists = await prisma.competition.findUnique({ where: { slug } });
    if (!exists) break;
    slug = `${base}-${i + 2}`;
  }

  const competition = await prisma.competition.create({
    data: {
      slug,
      name: params.name.trim(),
      description: params.description ?? null,
      bannerUrl: params.bannerUrl ?? null,
      prizePoolCents: params.prizePoolCents,
      prizeMode: params.prizeMode,
      rankingBudgetCents,
      viewsBudgetCents,
      startsAt: params.startsAt,
      endsAt: params.endsAt,
      allowedPlatforms: platforms,
      maxClipsPerParticipant: Math.max(1, params.maxClipsPerParticipant),
      rules: params.rules ?? null,
      requiredHashtags: params.requiredHashtags ?? [],
      requiredText: params.requiredText ?? null,
      createdById: params.actorUserId,
      status: params.status ?? "DRAFT",
      prizeRules: {
        create: params.prizeRules.map((rule, index) => ({
          kind: rule.kind,
          position: rule.position ?? null,
          amountCents: rule.amountCents ?? 0,
          viewsRequired: rule.viewsRequired ?? null,
          viewsPerUnit: rule.viewsPerUnit ?? null,
          amountPerUnitCents: rule.amountPerUnitCents ?? null,
          sortOrder: rule.sortOrder ?? index,
        })),
      },
    },
  });
  await writeCompetitionAudit({
    competitionId: competition.id,
    actorUserId: params.actorUserId,
    action: "COMPETITION_CREATED",
    entityType: "Competition",
    entityId: competition.id,
  });
  return { ok: true as const, id: competition.id, slug: competition.slug };
}

export async function refreshCompetitionStatuses() {
  const now = new Date();
  await prisma.competition.updateMany({
    where: { status: "SCHEDULED", startsAt: { lte: now }, endsAt: { gt: now } },
    data: { status: "ACTIVE" },
  });
  await prisma.competition.updateMany({
    where: { status: "ACTIVE", endsAt: { lte: now } },
    data: { status: "FINALIZING" },
  });
}
