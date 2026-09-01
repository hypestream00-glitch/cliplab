import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  allocateViewsPrizes,
  estimateRankingPrize,
  estimateViewsPrize,
  rankingRulesTotal,
  validatePrizeBudget,
} from "@/lib/competitions/prizes";
import { detectMetricAnomaly, nextSubmissionStatusFromMetrics, rankParticipants } from "@/lib/competitions/ranking";
import { parseSocialPostUrl } from "@/lib/competitions/parse-url";
import { canJoinStatus, canSubmitStatus, slugifyCompetitionName } from "@/lib/competitions/status";
import { platformMetricsSupport } from "@/lib/competitions/platforms";
import { competitionMetricsSyncMs } from "@/lib/competitions/sync";

const competitions: Array<{
  id: string;
  status: string;
  startsAt: Date;
  endsAt: Date;
  allowedPlatforms: string[];
  maxClipsPerParticipant: number;
}> = [];
const participants: Array<{
  id: string;
  competitionId: string;
  userId: string;
  workspaceId: string;
  status: string;
  participantCode?: string;
}> = [];
const submissions: Array<{
  id: string;
  competitionId: string;
  participantId: string;
  platform: string;
  postExternalId: string;
  status: string;
}> = [];
const accounts: Array<{
  id: string;
  workspaceId: string;
  mock: boolean;
  status: string;
  platform: string;
  username?: string;
}> = [];
const publications: Array<{
  id: string;
  workspaceId: string;
  clipId?: string | null;
  publishedAt?: Date | null;
  targets: Array<{ socialAccountId: string; externalPostId?: string | null; publishedAt?: Date | null }>;
}> = [];

vi.mock("@/lib/competitions/audit", () => ({
  writeCompetitionAudit: vi.fn(async () => undefined),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    competition: {
      findUnique: async ({ where }: { where: { id: string } }) => competitions.find((row) => row.id === where.id) ?? null,
    },
    competitionParticipant: {
      findUnique: async ({
        where,
      }: {
        where: { competitionId_userId: { competitionId: string; userId: string } };
      }) =>
        participants.find(
          (row) =>
            row.competitionId === where.competitionId_userId.competitionId &&
            row.userId === where.competitionId_userId.userId,
        ) ?? null,
      create: async ({
        data,
      }: {
        data: { competitionId: string; userId: string; workspaceId: string; participantCode: string };
      }) => {
        if (
          participants.some((row) => row.competitionId === data.competitionId && row.userId === data.userId) ||
          participants.some((row) => row.participantCode === data.participantCode)
        ) {
          throw { code: "P2002" };
        }
        const row = { id: `p_${participants.length + 1}`, status: "ACTIVE", ...data };
        participants.push(row);
        return row;
      },
    },
    socialAccount: {
      findFirst: async ({
        where,
      }: {
        where: {
          id?: string;
          workspaceId: string;
          mock: boolean;
          status: { in: string[] };
          platform?: { in: string[] };
        };
      }) =>
        accounts.find((row) => {
          if (where.id && row.id !== where.id) return false;
          if (row.workspaceId !== where.workspaceId) return false;
          if (row.mock !== where.mock) return false;
          if (!where.status.in.includes(row.status)) return false;
          if (where.platform?.in && !where.platform.in.includes(row.platform)) return false;
          return true;
        }) ?? null,
    },
    socialPublication: {
      findFirst: async ({ where }: { where: { id: string; workspaceId: string } }) =>
        publications.find((row) => row.id === where.id && row.workspaceId === where.workspaceId) ?? null,
    },
    competitionSubmission: {
      count: async ({ where }: { where: { participantId: string; status: { notIn: string[] } } }) =>
        submissions.filter((row) => row.participantId === where.participantId && !where.status.notIn.includes(row.status))
          .length,
      create: async ({
        data,
      }: {
        data: { competitionId: string; participantId: string; platform: string; postExternalId: string };
      }) => {
        if (
          submissions.some(
            (row) =>
              row.competitionId === data.competitionId &&
              row.platform === data.platform &&
              row.postExternalId === data.postExternalId,
          )
        ) {
          throw { code: "P2002" };
        }
        const row = { id: `s_${submissions.length + 1}`, status: "PENDING", ...data };
        submissions.push(row);
        return row;
      },
    },
  },
}));

describe("competition prizes", () => {
  const rankingRules = [
    { kind: "RANKING_POSITION", position: 1, amountCents: 300_000 },
    { kind: "RANKING_POSITION", position: 2, amountCents: 200_000 },
    { kind: "RANKING_POSITION", position: 3, amountCents: 150_000 },
  ];

  it("blocks ranking rules that exceed the prize pool", () => {
    const result = validatePrizeBudget(
      { prizePoolCents: 500_000, prizeMode: "RANKING", rankingBudgetCents: 0, viewsBudgetCents: 0 },
      rankingRules,
    );
    expect(result.ok).toBe(false);
  });

  it("accepts ranking rules within budget and reports leftovers", () => {
    const result = validatePrizeBudget(
      { prizePoolCents: 1_000_000, prizeMode: "RANKING", rankingBudgetCents: 0, viewsBudgetCents: 0 },
      rankingRules,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.distributedCents).toBe(650_000);
      expect(result.availableCents).toBe(350_000);
    }
  });

  it("blocks hybrid ranking + views budgets above the pool", () => {
    const result = validatePrizeBudget(
      { prizePoolCents: 1_000_000, prizeMode: "HYBRID", rankingBudgetCents: 700_000, viewsBudgetCents: 400_000 },
      rankingRules,
    );
    expect(result.ok).toBe(false);
  });

  it("caps per-user and total view prizes to the views budget", () => {
    expect(
      estimateViewsPrize({
        rules: [{ kind: "VIEWS_PER", viewsPerUnit: 1000, amountPerUnitCents: 100 }],
        views: 1_000_000,
        viewsBudgetCents: 50_000,
      }),
    ).toBe(50_000);
    const allocated = allocateViewsPrizes({
      views: [500_000, 500_000],
      rules: [{ kind: "VIEWS_PER", viewsPerUnit: 1000, amountPerUnitCents: 100 }],
      viewsBudgetCents: 30_000,
    });
    expect(allocated.reduce((sum, value) => sum + value, 0)).toBeLessThanOrEqual(30_000);
  });

  it("uses the highest reached views tier", () => {
    expect(
      estimateViewsPrize({
        rules: [
          { kind: "VIEWS_TIER", viewsRequired: 100_000, amountCents: 5_000 },
          { kind: "VIEWS_TIER", viewsRequired: 500_000, amountCents: 30_000 },
        ],
        views: 200_000,
        viewsBudgetCents: 1_000_000,
      }),
    ).toBe(5_000);
  });

  it("maps ranking positions", () => {
    expect(estimateRankingPrize(rankingRules, 1)).toBe(300_000);
    expect(estimateRankingPrize(rankingRules, 9)).toBe(0);
    expect(rankingRulesTotal(rankingRules)).toBe(650_000);
  });
});

describe("competition ranking and anti-abuse", () => {
  it("ranks only by valid views supplied by the backend", () => {
    const ranked = rankParticipants([
      { participantId: "b", userId: "u2", displayName: "B", validViews: 100, validClips: 1 },
      { participantId: "a", userId: "u1", displayName: "A", validViews: 400, validClips: 2 },
    ]);
    expect(ranked[0]?.participantId).toBe("a");
    expect(ranked[0]?.position).toBe(1);
  });

  it("flags decreasing views and extreme spikes without auto-banning", () => {
    expect(detectMetricAnomaly({ previousViews: 100, nextViews: 80 })).toBe("views-decreased");
    expect(detectMetricAnomaly({ previousViews: 100, nextViews: 3000 })).toBe("views-spike");
    expect(detectMetricAnomaly({ previousViews: 100, nextViews: 140 })).toBeNull();
  });

  it("does not reject a submission on a transient API failure", () => {
    expect(
      nextSubmissionStatusFromMetrics({
        current: "PENDING",
        owned: false,
        transient: true,
        viewsAvailable: false,
        views: null,
        previousViews: null,
      }).status,
    ).toBe("PENDING");
  });

  it("rejects unowned posts and verifies official views", () => {
    expect(
      nextSubmissionStatusFromMetrics({
        current: "PENDING",
        owned: false,
        viewsAvailable: false,
        views: null,
        previousViews: null,
      }).status,
    ).toBe("REJECTED");
    expect(
      nextSubmissionStatusFromMetrics({
        current: "PENDING",
        owned: true,
        viewsAvailable: true,
        views: 1200,
        previousViews: 1000,
      }),
    ).toMatchObject({ status: "VERIFIED", metricsAvailable: true });
  });
});

describe("competition urls, dates and platforms", () => {
  it("parses official post urls", () => {
    expect(parseSocialPostUrl("https://www.youtube.com/watch?v=abc123")).toMatchObject({
      platform: "YOUTUBE",
      postExternalId: "abc123",
    });
    expect(parseSocialPostUrl("https://www.tiktok.com/@user/video/1234567890")).toMatchObject({
      platform: "TIKTOK",
      postExternalId: "1234567890",
    });
    expect(parseSocialPostUrl("https://www.instagram.com/reel/CODE99/")).toMatchObject({
      platform: "INSTAGRAM",
      postExternalId: "CODE99",
    });
    expect(parseSocialPostUrl("https://example.com/video")).toBeNull();
  });

  it("blocks join/submit outside the competition window", () => {
    expect(canJoinStatus("ACTIVE")).toBe(true);
    expect(canJoinStatus("FINISHED")).toBe(false);
    expect(canSubmitStatus("ACTIVE")).toBe(true);
    expect(canSubmitStatus("FINALIZING")).toBe(false);
    expect(slugifyCompetitionName("Mugão Clip Challenge")).toBe("mugao-clip-challenge");
  });

  it("does not invent metrics support", () => {
    expect(platformMetricsSupport("TIKTOK").views).toBe(true);
    expect(platformMetricsSupport("YOUTUBE").shares).toBe(false);
    expect(platformMetricsSupport("KICK").views).toBe(false);
    expect(platformMetricsSupport("TWITCH").limitations).toBe("NOT SUPPORTED YET");
  });

  it("keeps competition metric sync interval bounded", () => {
    expect(competitionMetricsSyncMs()).toBeGreaterThanOrEqual(60_000);
  });
});

describe("participation and submissions", () => {
  beforeEach(() => {
    competitions.splice(0);
    participants.splice(0);
    submissions.splice(0);
    accounts.splice(0);
    publications.splice(0);
    competitions.push({
      id: "c1",
      status: "ACTIVE",
      startsAt: new Date("2026-01-01"),
      endsAt: new Date("2026-12-31"),
      allowedPlatforms: ["TIKTOK", "YOUTUBE"],
      maxClipsPerParticipant: 20,
    });
    accounts.push({
      id: "acc1",
      workspaceId: "ws1",
      mock: false,
      status: "CONNECTED",
      platform: "TIKTOK",
    });
  });

  it("joins once and rejects a duplicate join", async () => {
    const { joinCompetition } = await import("@/lib/competitions/join");
    const first = await joinCompetition({ competitionId: "c1", userId: "u1", workspaceId: "ws1" });
    const second = await joinCompetition({ competitionId: "c1", userId: "u1", workspaceId: "ws1" });
    expect(first.ok).toBe(true);
    if (first.ok) expect(first.participantCode).toMatch(/^CC-[A-Z0-9]{6}$/);
    expect(second).toEqual({ ok: false, error: "Você já está neste campeonato." });
  });

  it("blocks join after the campaign is closed", async () => {
    competitions[0]!.status = "FINISHED";
    const { joinCompetition } = await import("@/lib/competitions/join");
    const result = await joinCompetition({ competitionId: "c1", userId: "u1", workspaceId: "ws1" });
    expect(result.ok).toBe(false);
  });

  it("validates ownership, duplication and clip limits", async () => {
    participants.push({ id: "p1", competitionId: "c1", userId: "u1", workspaceId: "ws1", status: "ACTIVE" });
    const { createCompetitionSubmission } = await import("@/lib/competitions/submit");
    const invalidOwner = await createCompetitionSubmission({
      competitionId: "c1",
      userId: "u1",
      workspaceId: "ws1",
      socialAccountId: "acc1",
      publicationId: "pub-missing",
    });
    expect(invalidOwner.ok).toBe(false);

    publications.push({
      id: "pub1",
      workspaceId: "ws1",
      targets: [{ socialAccountId: "acc1", externalPostId: "111" }],
    });
    const created = await createCompetitionSubmission({
      competitionId: "c1",
      userId: "u1",
      workspaceId: "ws1",
      socialAccountId: "acc1",
      publicationId: "pub1",
    });
    expect(created.ok).toBe(true);
    const duplicate = await createCompetitionSubmission({
      competitionId: "c1",
      userId: "u1",
      workspaceId: "ws1",
      socialAccountId: "acc1",
      publicationId: "pub1",
    });
    expect(duplicate).toEqual({ ok: false, error: "Essa publicação já está participando." });
  });

  it("does not let studio users edit views or prize pool", () => {
    const studioActions = readFileSync(path.resolve("app/(studio)/studio/competitions/actions.ts"), "utf8");
    expect(studioActions).not.toContain("latestViews");
    expect(studioActions).not.toContain("prizePoolCents");
    expect(studioActions).not.toContain('from "@/lib/competitions/admin"');
    const adminActions = readFileSync(path.resolve("app/admin/competitions/actions.ts"), "utf8");
    expect(adminActions).toContain("requireAdmin");
    expect(adminActions).toContain("ADMIN_REJECTED_SUBMISSION");
  });
});
