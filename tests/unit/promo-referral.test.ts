import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { mergePlanWithGrants, planRank, remainingGrantDays } from "@/lib/billing/plan-rank";
import { normalizePromoCode, MUGAO12, PUBLIC_PROMO_CODE } from "@/lib/promo/catalog";
import { generateReferralCode, normalizeReferralCode } from "@/lib/referral/code";
import { studioNavGroups } from "@/lib/config/navigation";
import { renderEmailTemplate } from "@/lib/email/templates";

type GrantRow = {
  id: string;
  workspaceId: string;
  userId: string | null;
  source: string;
  sourceKey: string | null;
  planCode: "FREE" | "CREATOR" | "PRO";
  startsAt: Date;
  endsAt: Date;
};

const grants: GrantRow[] = [];
const promoCodes = new Map<string, { id: string; code: string; active: boolean; expiresAt: Date | null; grantPlanCode: "CREATOR"; benefitDays: number; maxRedemptions: number | null }>();
const redemptions: Array<{ promoCodeId: string; userId: string; workspaceId: string; grantId: string }> = [];
const profiles = new Map<string, { userId: string; code: string }>();
const attributions = new Map<string, { id: string; referrerUserId: string; referredUserId: string; code: string; convertedAt: Date | null }>();
const rewards = new Map<string, { id: string; attributionId: string; stripeEventId: string | null; days: number; referrerUserId: string }>();
const users = new Map<string, { id: string; email: string; name: string }>();
const members: Array<{ userId: string; workspaceId: string; role: string; createdAt: Date }> = [];

promoCodes.set("MUGAO12", {
  id: "promo_mugao12",
  code: "MUGAO12",
  active: true,
  expiresAt: null,
  grantPlanCode: "CREATOR",
  benefitDays: 3,
  maxRedemptions: null,
});

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    workspaceGrant: {
      findMany: async ({ where }: { where: { workspaceId: string; endsAt?: { gt: Date }; planCode?: string } }) => {
        return grants.filter((row) => {
          if (row.workspaceId !== where.workspaceId) return false;
          if (where.endsAt?.gt && row.endsAt.getTime() <= where.endsAt.gt.getTime()) return false;
          if (where.planCode && row.planCode !== where.planCode) return false;
          return true;
        });
      },
      create: async ({ data }: { data: GrantRow }) => {
        const row = { ...data, id: data.id ?? `grant_${grants.length + 1}` };
        grants.push(row);
        return row;
      },
    },
    promoCode: {
      upsert: async () => promoCodes.get("MUGAO12"),
      findUnique: async ({ where }: { where: { code: string } }) => promoCodes.get(where.code) ?? null,
    },
    promoRedemption: {
      findUnique: async ({ where }: { where: { promoCodeId_userId: { promoCodeId: string; userId: string } } }) =>
        redemptions.find(
          (row) => row.promoCodeId === where.promoCodeId_userId.promoCodeId && row.userId === where.promoCodeId_userId.userId,
        ) ?? null,
      count: async ({ where }: { where: { promoCodeId: string } }) =>
        redemptions.filter((row) => row.promoCodeId === where.promoCodeId).length,
      create: async ({ data }: { data: { promoCodeId: string; userId: string; workspaceId: string; grantId: string } }) => {
        if (redemptions.some((row) => row.promoCodeId === data.promoCodeId && row.userId === data.userId)) {
          throw { code: "P2002" };
        }
        redemptions.push(data);
        return data;
      },
    },
    referralProfile: {
      findUnique: async ({ where }: { where: { userId?: string; code?: string } }) => {
        if (where.userId) return [...profiles.values()].find((row) => row.userId === where.userId) ?? null;
        if (where.code) return [...profiles.values()].find((row) => row.code === where.code) ?? null;
        return null;
      },
      create: async ({ data }: { data: { userId: string; code: string } }) => {
        if ([...profiles.values()].some((row) => row.code === data.code || row.userId === data.userId)) {
          throw { code: "P2002" };
        }
        profiles.set(data.userId, data);
        return data;
      },
    },
    referralAttribution: {
      findUnique: async ({ where }: { where: { referredUserId?: string; id?: string } }) => {
        if (where.referredUserId) return attributions.get(where.referredUserId) ?? null;
        if (where.id) return [...attributions.values()].find((row) => row.id === where.id) ?? null;
        return null;
      },
      create: async ({ data }: { data: { referrerUserId: string; referredUserId: string; code: string } }) => {
        if (attributions.has(data.referredUserId)) throw { code: "P2002" };
        const row = { id: `attr_${attributions.size + 1}`, convertedAt: null, ...data };
        attributions.set(data.referredUserId, row);
        return row;
      },
      update: async ({ where, data }: { where: { id: string }; data: { convertedAt: Date } }) => {
        const row = [...attributions.values()].find((item) => item.id === where.id);
        if (row) row.convertedAt = data.convertedAt;
        return row;
      },
      count: async ({ where }: { where: { referrerUserId: string; convertedAt?: { not: null } } }) =>
        [...attributions.values()].filter((row) => {
          if (row.referrerUserId !== where.referrerUserId) return false;
          if (where.convertedAt) return Boolean(row.convertedAt);
          return true;
        }).length,
    },
    referralReward: {
      findUnique: async ({ where }: { where: { attributionId?: string; stripeEventId?: string } }) => {
        if (where.attributionId) return [...rewards.values()].find((row) => row.attributionId === where.attributionId) ?? null;
        if (where.stripeEventId) return [...rewards.values()].find((row) => row.stripeEventId === where.stripeEventId) ?? null;
        return null;
      },
      create: async ({ data }: { data: { id?: string; attributionId: string; referrerUserId: string; stripeEventId: string | null; days: number } }) => {
        if ([...rewards.values()].some((row) => row.attributionId === data.attributionId || (data.stripeEventId && row.stripeEventId === data.stripeEventId))) {
          throw { code: "P2002" };
        }
        const row = { id: data.id ?? `rew_${rewards.size + 1}`, ...data };
        rewards.set(row.id, row);
        return row;
      },
      aggregate: async ({ where }: { where: { referrerUserId: string } }) => ({
        _sum: {
          days: [...rewards.values()].filter((row) => row.referrerUserId === where.referrerUserId).reduce((sum, row) => sum + row.days, 0),
        },
      }),
    },
    workspaceMember: {
      findFirst: async ({ where }: { where: { workspaceId?: string; userId?: string; role: string } }) => {
        const row = members.find((item) => {
          if (where.role && item.role !== where.role) return false;
          if (where.workspaceId && item.workspaceId !== where.workspaceId) return false;
          if (where.userId && item.userId !== where.userId) return false;
          return true;
        });
        return row ?? null;
      },
    },
    user: {
      findUnique: async ({ where }: { where: { id: string } }) => users.get(where.id) ?? null,
    },
  },
}));

vi.mock("@/lib/email/send", () => ({
  sendReferralRewardEmail: vi.fn(async () => ({ ok: true, queued: true })),
}));

const root = path.resolve(__dirname, "../..");

describe("plan grants overlay", () => {
  it("keeps Stripe as the base and overlays a higher grant", () => {
    expect(planRank("PRO")).toBeGreaterThan(planRank("CREATOR"));
    expect(mergePlanWithGrants("FREE", [{ planCode: "CREATOR", endsAt: new Date(Date.now() + 1000) }])).toBe("CREATOR");
    expect(mergePlanWithGrants("PRO", [{ planCode: "CREATOR", endsAt: new Date(Date.now() + 1000) }])).toBe("PRO");
    expect(mergePlanWithGrants("FREE", [{ planCode: "CREATOR", endsAt: new Date(Date.now() - 1000) }])).toBe("FREE");
    expect(remainingGrantDays(new Date(Date.now() + 3 * 86400000 - 1000))).toBe(3);
  });
});

describe("MUGAO12 promo", () => {
  afterEach(() => {
    grants.length = 0;
    redemptions.length = 0;
  });

  it("is case-insensitive and grants 3 Creator days once per account", async () => {
    const { redeemPromoCode } = await import("@/lib/promo/redeem");
    expect(normalizePromoCode("mugao12")).toBe("MUGAO12");
    expect(normalizePromoCode("Mugao12")).toBe(PUBLIC_PROMO_CODE);
    expect(MUGAO12.benefitDays).toBe(3);
    expect(MUGAO12.grantPlanCode).toBe("CREATOR");
    const first = await redeemPromoCode({ userId: "user_a", workspaceId: "ws_a", code: "mugao12" });
    expect(first.ok).toBe(true);
    if (first.ok) {
      expect(first.days).toBe(3);
      expect(first.endsAt.getTime()).toBeGreaterThan(Date.now());
    }
    const second = await redeemPromoCode({ userId: "user_a", workspaceId: "ws_a", code: "MUGAO12" });
    expect(second).toEqual({ ok: false, reason: "already-used" });
  });

  it("rejects unknown codes", async () => {
    const { redeemPromoCode, redeemPromoMessage } = await import("@/lib/promo/redeem");
    const result = await redeemPromoCode({ userId: "user_a", workspaceId: "ws_a", code: "NOPE" });
    expect(result.ok).toBe(false);
    expect(redeemPromoMessage(result)).toMatch(/inválido ou expirado/i);
  });
});

describe("referral", () => {
  afterEach(() => {
    grants.length = 0;
    profiles.clear();
    attributions.clear();
    rewards.clear();
    users.clear();
    members.length = 0;
  });

  it("issues unique codes and blocks self/duplicate attribution", async () => {
    const a = generateReferralCode();
    const b = generateReferralCode();
    expect(a).toMatch(/^[A-Z0-9]{8}$/);
    expect(normalizeReferralCode("abc123xy")).toBe("ABC123XY");
    expect(a).not.toBe(b);
    const { ensureReferralProfile } = await import("@/lib/referral/profile");
    const { attributeReferral } = await import("@/lib/referral/attribute");
    const profile = await ensureReferralProfile("referrer");
    const self = await attributeReferral({ referredUserId: "referrer", code: profile.code });
    expect(self.reason).toBe("self");
    const ok = await attributeReferral({ referredUserId: "friend", code: profile.code });
    expect(ok.ok).toBe(true);
    const dup = await attributeReferral({ referredUserId: "friend", code: profile.code });
    expect(dup.reason).toBe("duplicate");
  });

  it("rewards +7 Pro only on the first paid conversion and ignores webhook replay", async () => {
    const { ensureReferralProfile } = await import("@/lib/referral/profile");
    const { attributeReferral } = await import("@/lib/referral/attribute");
    const { maybeGrantReferralReward } = await import("@/lib/referral/reward");
    users.set("referrer", { id: "referrer", email: "a@example.com", name: "Ana" });
    members.push(
      { userId: "friend", workspaceId: "ws_friend", role: "OWNER", createdAt: new Date() },
      { userId: "referrer", workspaceId: "ws_ref", role: "OWNER", createdAt: new Date() },
    );
    const profile = await ensureReferralProfile("referrer");
    await attributeReferral({ referredUserId: "friend", code: profile.code });
    const first = await maybeGrantReferralReward({
      referredWorkspaceId: "ws_friend",
      stripeEventId: "evt_1",
      stripeInvoiceId: "in_1",
      paidAmount: 5990,
      planCode: "CREATOR",
    });
    expect(first.ok).toBe(true);
    if (first.ok) expect(first.days).toBe(7);
    const replay = await maybeGrantReferralReward({
      referredWorkspaceId: "ws_friend",
      stripeEventId: "evt_1",
      paidAmount: 5990,
      planCode: "CREATOR",
    });
    expect(replay).toMatchObject({ ok: true, duplicate: true });
    const secondCharge = await maybeGrantReferralReward({
      referredWorkspaceId: "ws_friend",
      stripeEventId: "evt_2",
      paidAmount: 5990,
      planCode: "CREATOR",
    });
    expect(secondCharge).toMatchObject({ ok: true, duplicate: true });
    expect(rewards.size).toBe(1);
    expect(grants[0]?.planCode).toBe("PRO");
  });

  it("does not reward unpaid or trial invoices", async () => {
    const { maybeGrantReferralReward } = await import("@/lib/referral/reward");
    const unpaid = await maybeGrantReferralReward({
      referredWorkspaceId: "ws_friend",
      stripeEventId: "evt_trial",
      paidAmount: 0,
      planCode: "CREATOR",
    });
    expect(unpaid).toEqual({ ok: false, reason: "not-paid" });
  });
});

describe("visual and public copy", () => {
  it("orders the new sidebar and keeps CortaClip public URLs", () => {
    const hrefs = studioNavGroups.flatMap((group) => group.items.map((item) => item.href));
    expect(hrefs.slice(0, 8)).toEqual([
      "/studio",
      "/studio/trending",
      "/studio/projects",
      "/studio/clips",
      "/studio/create",
      "/studio/publishing",
      "/studio/calendar",
      "/studio/accounts",
    ]);
    expect(hrefs).toContain("/studio/competitions");
    const sidebar = readFileSync(path.join(root, "components/layout/sidebar.tsx"), "utf8");
    expect(sidebar).toContain("CouponCard");
    expect(sidebar).toContain("Novo projeto");
    const coupon = readFileSync(path.join(root, "components/layout/coupon-card.tsx"), "utf8");
    expect(coupon).toContain("MUGAO12");
    expect(coupon).toContain("Cupom MUGAO12 copiado");
    expect(coupon).toContain("Como usar?");
    const referral = readFileSync(path.join(root, "components/layout/referral-button.tsx"), "utf8");
    expect(referral).toContain("Indique e ganhe");
    expect(referral).toContain("Copiar meu link");
    expect(referral).toContain("Ganhe Pro indicando amigos");
    const createPage = readFileSync(path.join(root, "app/(studio)/studio/create/page.tsx"), "utf8");
    expect(createPage).toMatch(/Criar clips com[\s\S]*IA/);
    expect(createPage).toContain("Envie um vídeo e deixe a IA encontrar os melhores momentos.");
    const createForm = readFileSync(path.join(root, "app/(studio)/studio/create/create-form.tsx"), "utf8");
    expect(createForm).toContain("Em breve");
    expect(createForm).toContain("/api/uploads/init");
    expect(createForm).not.toMatch(/sourceUrl:\s*url/);
    const theme = readFileSync(path.join(root, "app/globals.css"), "utf8");
    expect(theme).toContain("--surface:");
    expect(theme).toContain("--magenta:");
    expect(theme).toContain("--glow-primary:");
    expect(theme).toContain("#050507");
    expect(theme).toContain("#e92acb");
    expect(theme).toContain("#8b3dff");
    expect(theme).toContain("#2563eb");
  });

  it("renders referral reward email without CLIPLAB", () => {
    const mail = renderEmailTemplate("referral-reward", { name: "Ana" });
    expect(mail.subject).toMatch(/7 dias de Pro/);
    expect(mail.html).toContain("CortaClip");
    expect(mail.text).toContain("https://cortaclip.com");
    expect(`${mail.subject}${mail.html}${mail.text}`).not.toContain("CLIPLAB");
  });
});

describe("security of grants", () => {
  it("does not let the client choose plan days or secrets", () => {
    const action = readFileSync(path.join(root, "app/(studio)/studio/settings/billing/actions.ts"), "utf8");
    expect(action).toContain("redeemPromoCode");
    expect(action).not.toContain("grantPlanCode: formData");
    expect(action).not.toContain("days: Number(formData");
    const clientFiles = [
      "components/layout/coupon-card.tsx",
      "components/billing/promo-redeem-form.tsx",
      "components/layout/referral-button.tsx",
    ];
    for (const file of clientFiles) {
      const src = readFileSync(path.join(root, file), "utf8");
      expect(src).not.toMatch(/STRIPE_SECRET_KEY|RESEND_API_KEY|OPENAI_API_KEY|DATABASE_URL|REDIS_URL/);
    }
  });
});
