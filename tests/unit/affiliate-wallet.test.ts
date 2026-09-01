import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "path";
import { maskPixKey, normalizePixKey, validatePixKey } from "@/lib/referral/pix";
import { sumLedger } from "@/lib/referral/wallet";
import { MIN_WITHDRAWAL_CENTS, REFERRAL_CASH_CENTS, REFERRAL_AI_MINUTES } from "@/lib/referral/config";
import { nextReferralMilestone } from "@/lib/referral/stats";
import { maybeGrantReferralReward } from "@/lib/referral/reward";

process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || "test-affiliate-encryption-key";

const store = vi.hoisted(() => {
  const attributions = new Map<string, { id: string; referrerUserId: string; referredUserId: string; convertedAt: Date | null }>();
  const rewards = new Map<string, Record<string, unknown>>();
  const ledger: Array<{ userId: string; type: string; amountCents: number; balanceKind: string; idempotencyKey: string }> = [];
  const minuteGrants: Array<{ id: string; workspaceId: string; sourceKey: string; seconds: number; remaining: number }> = [];
  const withdrawals: Array<Record<string, unknown> & { id: string; userId: string; amountCents: number; status: string }> = [];
  const members: Array<{ userId: string; workspaceId: string; role: string; createdAt: Date }> = [];
  const users = new Map<string, { id: string; email: string; name: string }>();
  const flags: Array<{ userId: string; reason: string }> = [];
  const audits: Array<{ action: string; metadata?: unknown }> = [];
  const usageEvents: Array<{ idempotencyKey: string; amountSeconds: number; type: string; workspaceId: string }> = [];
  function unique(condition: boolean) {
    if (condition) throw { code: "P2002" };
  }
  const prisma: Record<string, unknown> = {};
  Object.assign(prisma, {
    $transaction: async (fn: (tx: typeof prisma) => unknown) => fn(prisma),
    $executeRaw: async () => 1,
    workspaceMember: {
      findFirst: async ({ where }: { where: { workspaceId?: string; userId?: string; role?: string } }) =>
        members.find((row) => {
          if (where.role && row.role !== where.role) return false;
          if (where.workspaceId && row.workspaceId !== where.workspaceId) return false;
          if (where.userId && row.userId !== where.userId) return false;
          return true;
        }) ?? null,
    },
    referralAttribution: {
      findUnique: async ({ where }: { where: { referredUserId?: string; id?: string } }) => {
        if (where.referredUserId) return attributions.get(where.referredUserId) ?? null;
        if (where.id) return [...attributions.values()].find((row) => row.id === where.id) ?? null;
        return null;
      },
      update: async ({ where, data }: { where: { id: string }; data: { convertedAt: Date } }) => {
        const row = [...attributions.values()].find((item) => item.id === where.id);
        if (row) row.convertedAt = data.convertedAt;
        return row;
      },
      count: async () => attributions.size,
    },
    referralReward: {
      findUnique: async ({ where }: { where: { attributionId?: string; stripeEventId?: string; id?: string } }) => {
        if (where.id) return rewards.get(where.id) ?? null;
        if (where.attributionId) return [...rewards.values()].find((row) => row.attributionId === where.attributionId) ?? null;
        if (where.stripeEventId) return [...rewards.values()].find((row) => row.stripeEventId === where.stripeEventId) ?? null;
        return null;
      },
      findFirst: async ({ where }: { where: { referredUserId?: string; stripeInvoiceId?: string; stripeSubscriptionId?: string } }) =>
        [...rewards.values()].find((row) => {
          if (where.referredUserId && row.referredUserId !== where.referredUserId) return false;
          if (where.stripeInvoiceId && row.stripeInvoiceId !== where.stripeInvoiceId) return false;
          if (where.stripeSubscriptionId && row.stripeSubscriptionId !== where.stripeSubscriptionId) return false;
          return true;
        }) ?? null,
      findMany: async ({ where }: { where: { status?: string; availableAt?: { lte: Date } } }) =>
        [...rewards.values()].filter((row) => {
          if (where.status && row.status !== where.status) return false;
          const availableAt = row.availableAt as Date | null;
          if (where.availableAt?.lte && (!availableAt || availableAt.getTime() > where.availableAt.lte.getTime())) return false;
          return true;
        }),
      create: async ({ data }: { data: Record<string, unknown> }) => {
        unique([...rewards.values()].some((row) => row.attributionId === data.attributionId || (data.stripeEventId && row.stripeEventId === data.stripeEventId)));
        const row = { ...data, id: (data.id as string) ?? `rew_${rewards.size + 1}`, createdAt: new Date(), reviewStatus: data.reviewStatus ?? "NORMAL" };
        rewards.set(row.id as string, row);
        return row;
      },
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = rewards.get(where.id);
        if (!row) return null;
        Object.assign(row, data);
        return row;
      },
      count: async () => rewards.size,
    },
    walletLedgerEntry: {
      create: async ({ data }: { data: (typeof ledger)[number] }) => {
        unique(ledger.some((row) => row.idempotencyKey === data.idempotencyKey));
        ledger.push(data);
        return data;
      },
      aggregate: async ({ where }: { where: { userId: string; balanceKind: string } }) => ({
        _sum: {
          amountCents: ledger
            .filter((row) => row.userId === where.userId && row.balanceKind === where.balanceKind)
            .reduce((sum, row) => sum + row.amountCents, 0),
        },
      }),
    },
    minuteGrant: {
      create: async ({ data }: { data: { workspaceId: string; sourceKey: string; seconds: number; remaining: number } }) => {
        unique(minuteGrants.some((row) => row.sourceKey === data.sourceKey));
        const row = { id: `mg_${minuteGrants.length + 1}`, ...data };
        minuteGrants.push(row);
        return row;
      },
      findMany: async () => minuteGrants,
      aggregate: async () => ({ _sum: { remaining: minuteGrants.reduce((sum, row) => sum + row.remaining, 0) } }),
      update: async ({ where, data }: { where: { id: string }; data: { remaining: number } }) => {
        const row = minuteGrants.find((item) => item.id === where.id);
        if (row) row.remaining = data.remaining;
        return row;
      },
    },
    withdrawal: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const row = {
          ...data,
          id: (data.id as string) ?? `wd_${withdrawals.length + 1}`,
          requestedAt: new Date(),
          paidAt: null,
          rejectedAt: null,
          cancelledAt: null,
        };
        withdrawals.push(row as unknown as (typeof withdrawals)[number]);
        return row;
      },
      findUnique: async ({ where }: { where: { id: string } }) => withdrawals.find((row) => row.id === where.id) ?? null,
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = withdrawals.find((item) => item.id === where.id);
        if (!row) return null;
        Object.assign(row, data);
        return row;
      },
    },
    usageEvent: {
      findUnique: async ({ where }: { where: { idempotencyKey: string } }) =>
        usageEvents.find((row) => row.idempotencyKey === where.idempotencyKey) ?? null,
      create: async ({ data }: { data: (typeof usageEvents)[number] }) => {
        unique(usageEvents.some((row) => row.idempotencyKey === data.idempotencyKey));
        usageEvents.push(data);
        return data;
      },
      update: async ({ where, data }: { where: { idempotencyKey: string }; data: { amountSeconds: number } }) => {
        const row = usageEvents.find((item) => item.idempotencyKey === where.idempotencyKey);
        if (row) row.amountSeconds = data.amountSeconds;
        return row;
      },
    },
    user: {
      findUnique: async ({ where }: { where: { id: string } }) => users.get(where.id) ?? null,
    },
    auditLog: {
      create: async ({ data }: { data: { action: string; metadata?: unknown } }) => {
        audits.push(data);
        return data;
      },
    },
    adminAction: { create: async () => ({}) },
    affiliateFlag: {
      create: async ({ data }: { data: { userId: string; reason: string } }) => {
        flags.push(data);
        return data;
      },
    },
    subscription: {
      findFirst: async () => ({ workspaceId: "ws_friend", id: "subrow", plan: { code: "CREATOR" } }),
    },
  });
  return { prisma, attributions, rewards, ledger, minuteGrants, withdrawals, members, users, flags, audits };
});

const { attributions, rewards, ledger, minuteGrants, withdrawals, members, users, flags, audits } = store;

vi.mock("@/lib/db/prisma", () => ({ prisma: store.prisma }));
vi.mock("@/lib/email/send", () => ({
  sendReferralRewardEmail: vi.fn(async () => ({ ok: true, queued: true })),
  sendWithdrawalApprovedEmail: vi.fn(async () => ({ ok: true, queued: true })),
  sendWithdrawalPaidEmail: vi.fn(async () => ({ ok: true, queued: true })),
  sendWithdrawalRejectedEmail: vi.fn(async () => ({ ok: true, queued: true })),
}));
vi.mock("@/lib/billing/apply-subscription", () => ({
  findWorkspaceForStripeCustomer: async () => ({ workspaceId: "ws_friend", id: "subrow", plan: { code: "CREATOR" } }),
}));

function seedReferral() {
  users.set("referrer", { id: "referrer", email: "a@example.com", name: "Ana" });
  members.push(
    { userId: "friend", workspaceId: "ws_friend", role: "OWNER", createdAt: new Date() },
    { userId: "referrer", workspaceId: "ws_ref", role: "OWNER", createdAt: new Date() },
  );
  attributions.set("friend", {
    id: "attr_1",
    referrerUserId: "referrer",
    referredUserId: "friend",
    convertedAt: null,
  });
}

describe("affiliate pix and ledger math", () => {
  it("validates and masks PIX keys without exposing the full value", () => {
    expect(validatePixKey("CPF", "529.982.247-25")).toBe(true);
    expect(validatePixKey("EMAIL", "pablo@gmail.com")).toBe(true);
    expect(validatePixKey("PHONE", "11999998888")).toBe(true);
    expect(maskPixKey("CPF", normalizePixKey("CPF", "52998224725"))).toBe("***.***.***-25");
    expect(maskPixKey("EMAIL", "pablo@gmail.com")).toBe("pa***@gmail.com");
    expect(validatePixKey("CPF", "11111111111")).toBe(false);
  });

  it("keeps a verifiable signed ledger", () => {
    const entries = [
      { amountCents: 500, balanceKind: "PENDING" },
      { amountCents: -500, balanceKind: "PENDING" },
      { amountCents: 500, balanceKind: "AVAILABLE" },
      { amountCents: -3000, balanceKind: "AVAILABLE" },
    ];
    expect(sumLedger(entries, "PENDING")).toBe(0);
    expect(sumLedger(entries, "AVAILABLE")).toBe(-2500);
  });

  it("shows the next visual milestone without paying extra cash", () => {
    const next = nextReferralMilestone(4);
    expect(next.target).toBe(5);
    expect(next.remaining).toBe(1);
  });
});

describe("referral cash reward", () => {
  beforeEach(() => {
    attributions.clear();
    rewards.clear();
    ledger.length = 0;
    minuteGrants.length = 0;
    withdrawals.length = 0;
    members.length = 0;
    users.clear();
    flags.length = 0;
    audits.length = 0;
  });

  afterEach(() => {
    attributions.clear();
    rewards.clear();
    ledger.length = 0;
    minuteGrants.length = 0;
    withdrawals.length = 0;
    members.length = 0;
    users.clear();
  });

  it("creates R$5 pending and +30 minutes on the first paid subscription only", async () => {
    seedReferral();
    const first = await maybeGrantReferralReward({
      referredWorkspaceId: "ws_friend",
      stripeEventId: "evt_1",
      stripeInvoiceId: "in_1",
      paidAmount: 5990,
      planCode: "CREATOR",
    });
    expect(first).toMatchObject({ ok: true, cashAmountCents: REFERRAL_CASH_CENTS, aiMinutes: REFERRAL_AI_MINUTES });
    const replay = await maybeGrantReferralReward({
      referredWorkspaceId: "ws_friend",
      stripeEventId: "evt_1",
      paidAmount: 5990,
      planCode: "CREATOR",
    });
    expect(replay).toMatchObject({ ok: true, duplicate: true });
    const renewal = await maybeGrantReferralReward({
      referredWorkspaceId: "ws_friend",
      stripeEventId: "evt_2",
      paidAmount: 5990,
      planCode: "CREATOR",
    });
    expect(renewal).toMatchObject({ ok: true, duplicate: true });
    expect(rewards.size).toBe(1);
    expect(minuteGrants).toHaveLength(1);
    expect(ledger.filter((row) => row.type === "REFERRAL_PENDING")).toHaveLength(1);
    expect(audits.some((row) => row.action === "REFERRAL_REWARD_CREATED")).toBe(true);
  });

  it("blocks unpaid invoices and self-referral leftovers", async () => {
    const unpaid = await maybeGrantReferralReward({
      referredWorkspaceId: "ws_friend",
      stripeEventId: "evt_trial",
      paidAmount: 0,
      planCode: "CREATOR",
    });
    expect(unpaid).toEqual({ ok: false, reason: "not-paid" });
  });
});

describe("wallet release refund and withdrawals", () => {
  beforeEach(() => {
    attributions.clear();
    rewards.clear();
    ledger.length = 0;
    minuteGrants.length = 0;
    withdrawals.length = 0;
    members.length = 0;
    users.clear();
    flags.length = 0;
    audits.length = 0;
    seedReferral();
  });

  it("moves pending cash to available after the hold and cancels pending on refund", async () => {
    const { maybeGrantReferralReward: grant } = await import("@/lib/referral/reward");
    const { releaseReferralReward } = await import("@/lib/referral/release");
    const { maybeCancelReferralOnRefund } = await import("@/lib/referral/refund");
    await grant({
      referredWorkspaceId: "ws_friend",
      stripeEventId: "evt_1",
      stripeInvoiceId: "in_1",
      paidAmount: 5990,
      planCode: "CREATOR",
    });
    const reward = [...rewards.values()][0] as { id: string; status: string; availableAt: Date | null; reviewStatus: string };
    reward.availableAt = new Date(Date.now() - 1000);
    expect(await releaseReferralReward(reward.id)).toBe(true);
    expect(reward.status).toBe("AVAILABLE");
    expect(sumLedger(ledger, "PENDING")).toBe(0);
    expect(sumLedger(ledger, "AVAILABLE")).toBe(500);

    reward.status = "PENDING";
    ledger.push({
      userId: "referrer",
      type: "TEST_RESET",
      amountCents: -500,
      balanceKind: "AVAILABLE",
      idempotencyKey: "reset-av",
    });
    ledger.push({
      userId: "referrer",
      type: "TEST_RESET",
      amountCents: 500,
      balanceKind: "PENDING",
      idempotencyKey: "reset-pe",
    });
    const cancelled = await maybeCancelReferralOnRefund({
      stripeEventId: "evt_ref",
      stripeCustomerId: "cus_1",
      stripeInvoiceId: "in_1",
    });
    expect(cancelled).toMatchObject({ ok: true, cancelled: true });
    expect([...rewards.values()][0].status).toBe("CANCELLED");
  });

  it("marks AVAILABLE refunds for review instead of creating a negative balance", async () => {
    const { maybeGrantReferralReward: grant } = await import("@/lib/referral/reward");
    const { releaseReferralReward } = await import("@/lib/referral/release");
    const { maybeCancelReferralOnRefund } = await import("@/lib/referral/refund");
    await grant({
      referredWorkspaceId: "ws_friend",
      stripeEventId: "evt_1",
      stripeInvoiceId: "in_1",
      paidAmount: 5990,
      planCode: "CREATOR",
    });
    const reward = [...rewards.values()][0] as { id: string; status: string; availableAt: Date | null; reviewStatus: string };
    reward.availableAt = new Date(Date.now() - 1000);
    await releaseReferralReward(reward.id);
    const result = await maybeCancelReferralOnRefund({
      stripeEventId: "evt_ref2",
      stripeCustomerId: "cus_1",
      stripeInvoiceId: "in_1",
    });
    expect(result).toMatchObject({ ok: true, cancelled: false });
    expect(reward.reviewStatus).toBe("REVIEW");
    expect(sumLedger(ledger, "AVAILABLE")).toBe(500);
    expect(flags.some((row) => row.reason === "REFUND_AFTER_AVAILABLE")).toBe(true);
  });

  it("reserves, rejects, cancels and pays withdrawals without double-spend", async () => {
    ledger.push({
      userId: "referrer",
      type: "SEED",
      amountCents: 4000,
      balanceKind: "AVAILABLE",
      idempotencyKey: "seed",
    });
    const { requestWithdrawal, cancelWithdrawal, rejectWithdrawal, approveWithdrawal, markWithdrawalPaid } = await import(
      "@/lib/referral/withdrawals"
    );
    const tooSmall = await requestWithdrawal({
      userId: "referrer",
      amountCents: 2500,
      pixKeyType: "EMAIL",
      pixKey: "ana@gmail.com",
      holderName: "Ana Silva",
    });
    expect(tooSmall).toEqual({ ok: false, error: "below-minimum" });
    const over = await requestWithdrawal({
      userId: "referrer",
      amountCents: 5000,
      pixKeyType: "EMAIL",
      pixKey: "ana@gmail.com",
      holderName: "Ana Silva",
    });
    expect(over).toEqual({ ok: false, error: "insufficient" });
    const ok = await requestWithdrawal({
      userId: "referrer",
      amountCents: 3000,
      pixKeyType: "EMAIL",
      pixKey: "ana@gmail.com",
      holderName: "Ana Silva",
    });
    expect(ok.ok).toBe(true);
    expect(sumLedger(ledger, "AVAILABLE")).toBe(1000);
    const firstId = withdrawals[0].id;
    const cancel = await cancelWithdrawal({ userId: "referrer", withdrawalId: firstId });
    expect(cancel.ok).toBe(true);
    expect(sumLedger(ledger, "AVAILABLE")).toBe(4000);

    const second = await requestWithdrawal({
      userId: "referrer",
      amountCents: MIN_WITHDRAWAL_CENTS,
      pixKeyType: "EMAIL",
      pixKey: "ana@gmail.com",
      holderName: "Ana Silva",
    });
    expect(second.ok).toBe(true);
    const secondId = withdrawals[1].id;
    const approved = await approveWithdrawal({ adminId: "admin", withdrawalId: secondId });
    expect(approved.ok).toBe(true);
    expect(sumLedger(ledger, "AVAILABLE")).toBe(1000);
    const paid = await markWithdrawalPaid({ adminId: "admin", withdrawalId: secondId, paymentReference: "PIX 01/09/2026 18:30" });
    expect(paid.ok).toBe(true);
    expect(withdrawals[1].status).toBe("PAID");
    expect(sumLedger(ledger, "AVAILABLE")).toBe(1000);
    expect(audits.some((row) => row.action === "WITHDRAWAL_PAID")).toBe(true);

    const third = await requestWithdrawal({
      userId: "referrer",
      amountCents: 1000,
      pixKeyType: "EMAIL",
      pixKey: "ana@gmail.com",
      holderName: "Ana Silva",
    });
    expect(third).toEqual({ ok: false, error: "below-minimum" });
    ledger.push({
      userId: "referrer",
      type: "SEED2",
      amountCents: 2000,
      balanceKind: "AVAILABLE",
      idempotencyKey: "seed2",
    });
    const fourth = await requestWithdrawal({
      userId: "referrer",
      amountCents: 3000,
      pixKeyType: "EMAIL",
      pixKey: "ana@gmail.com",
      holderName: "Ana Silva",
    });
    expect(fourth.ok).toBe(true);
    const rejected = await rejectWithdrawal({
      adminId: "admin",
      withdrawalId: withdrawals[2].id,
      reason: "Chave PIX inválida",
    });
    expect(rejected.ok).toBe(true);
    expect(sumLedger(ledger, "AVAILABLE")).toBe(3000);
  });
});

describe("affiliate surfaces and safety", () => {
  it("does not let the client grant rewards or read Stripe secrets", () => {
    const root = path.resolve(__dirname, "../..");
    const client = readFileSync(path.join(root, "components/layout/referral-button.tsx"), "utf8");
    expect(client).not.toMatch(/maybeGrantReferralReward|STRIPE_SECRET_KEY|ENCRYPTION_KEY/);
    const actions = readFileSync(path.join(root, "app/(studio)/studio/referrals/actions.ts"), "utf8");
    expect(actions).toContain("requestWithdrawal");
    expect(actions).not.toContain("cashAmountCents: Number");
    const webhook = readFileSync(path.join(root, "lib/billing/webhook.ts"), "utf8");
    expect(webhook).toContain("invoice.paid");
    expect(webhook).toContain("charge.refunded");
    expect(webhook).not.toMatch(/paidAmount: 1/);
    const admin = readFileSync(path.join(root, "app/admin/layout.tsx"), "utf8");
    expect(admin).toContain("requireAdmin");
    const scheduler = readFileSync(path.join(root, "lib/queue/scheduler.ts"), "utf8");
    expect(scheduler).toContain("releaseDueReferralRewards");
  });
});
