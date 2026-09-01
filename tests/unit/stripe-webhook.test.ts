import { afterEach, describe, expect, it, vi } from "vitest";
import { maybeGrantReferralReward } from "@/lib/referral/reward";

const createEvent = vi.fn();
const findFirst = vi.fn();
const upsertSub = vi.fn();
const updateSub = vi.fn();
const upsertInvoice = vi.fn();
const findOwner = vi.fn();
const constructEvent = vi.fn();
const retrieveSubscription = vi.fn();

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    processedStripeEvent: {
      create: (...args: unknown[]) => createEvent(...args),
      delete: vi.fn(),
    },
    subscription: {
      findFirst: (...args: unknown[]) => findFirst(...args),
      upsert: (...args: unknown[]) => upsertSub(...args),
      update: (...args: unknown[]) => updateSub(...args),
    },
    plan: {
      findUnique: vi.fn(async ({ where }: { where: { code: string } }) => ({ id: `plan_${where.code}`, code: where.code })),
    },
    invoiceRecord: {
      upsert: (...args: unknown[]) => upsertInvoice(...args),
    },
    workspaceMember: {
      findFirst: (...args: unknown[]) => findOwner(...args),
    },
  },
}));

vi.mock("@/lib/billing/stripe-client", () => ({
  getStripeClient: () => ({
    webhooks: { constructEvent: (...args: unknown[]) => constructEvent(...args) },
    subscriptions: { retrieve: (...args: unknown[]) => retrieveSubscription(...args) },
  }),
  subscriptionPeriod: () => ({ start: new Date("2026-08-01"), end: new Date("2026-09-01") }),
  subscriptionPriceId: (sub: { items?: { data?: Array<{ price?: { id?: string } }> } }) => sub.items?.data?.[0]?.price?.id ?? null,
}));

vi.mock("@/lib/email/send", () => ({
  sendTemplatedEmail: vi.fn(async () => ({ ok: false, reason: "EMAIL: CONFIGURATION REQUIRED", id: "payment-failed" })),
}));

vi.mock("@/lib/email/billing", () => ({
  notifySubscriptionActivated: vi.fn(async () => undefined),
  notifySubscriptionChanged: vi.fn(async () => undefined),
  notifySubscriptionCanceled: vi.fn(async () => undefined),
  notifyPaymentFailed: vi.fn(async () => undefined),
}));

vi.mock("@/lib/referral/reward", () => ({
  maybeGrantReferralReward: vi.fn(async () => ({ ok: false, reason: "no-attribution" })),
}));

function setTestStripeEnv() {
  process.env.STRIPE_SECRET_KEY = "sk_test_cliplab";
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = "pk_test_cliplab";
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_cliplab";
  process.env.STRIPE_PRICE_CREATOR = "price_creator_test";
  process.env.STRIPE_PRICE_PRO = "price_pro_test";
}

describe("stripe webhook", () => {
  afterEach(() => {
    createEvent.mockReset();
    findFirst.mockReset();
    upsertSub.mockReset();
    updateSub.mockReset();
    upsertInvoice.mockReset();
    findOwner.mockReset();
    constructEvent.mockReset();
    retrieveSubscription.mockReset();
    vi.mocked(maybeGrantReferralReward).mockClear();
    vi.mocked(maybeGrantReferralReward).mockResolvedValue({ ok: false, reason: "no-attribution" });
  });

  it("rejects invalid signatures", async () => {
    setTestStripeEnv();
    constructEvent.mockImplementation(() => {
      throw new Error("Invalid signature");
    });
    const { handleStripeWebhook } = await import("@/lib/billing/webhook");
    const result = await handleStripeWebhook({ rawBody: "{}", signature: "bad", ip: "10.0.0.1" });
    expect(result).toEqual({ ok: false, status: 400, error: "Invalid signature" });
    expect(createEvent).not.toHaveBeenCalled();
  });

  it("is idempotent on duplicate event ids", async () => {
    setTestStripeEnv();
    constructEvent.mockReturnValue({ id: "evt_dup", type: "customer.subscription.updated", data: { object: {} } });
    createEvent.mockRejectedValue({ code: "P2002" });
    const { handleStripeWebhook } = await import("@/lib/billing/webhook");
    const result = await handleStripeWebhook({ rawBody: "{}", signature: "sig", ip: "10.0.0.2" });
    expect(result).toMatchObject({ ok: true, duplicate: true });
    expect(upsertSub).not.toHaveBeenCalled();
  });

  it("does not trust metadata workspace when customer belongs to another workspace", async () => {
    setTestStripeEnv();
    const subscription = {
      id: "sub_1",
      status: "active",
      customer: "cus_b",
      cancel_at_period_end: false,
      metadata: { workspaceId: "ws_a", plan: "PRO" },
      items: { data: [{ current_period_start: 1, current_period_end: 2, price: { id: "price_pro_test" } }] },
    };
    constructEvent.mockReturnValue({
      id: "evt_iso",
      type: "customer.subscription.updated",
      data: { object: subscription },
    });
    createEvent.mockResolvedValue({});
    findFirst.mockResolvedValue({ workspaceId: "ws_b", plan: { code: "CREATOR" }, stripeCustomerId: "cus_b" });
    const { handleStripeWebhook } = await import("@/lib/billing/webhook");
    const result = await handleStripeWebhook({ rawBody: "{}", signature: "sig", ip: "10.0.0.3" });
    expect(result.ok).toBe(true);
    expect(upsertSub).not.toHaveBeenCalled();
  });

  it("syncs an active subscription for the customer workspace", async () => {
    setTestStripeEnv();
    const subscription = {
      id: "sub_ok",
      status: "active",
      customer: "cus_a",
      cancel_at_period_end: false,
      metadata: { workspaceId: "ws_a", plan: "CREATOR" },
      items: { data: [{ current_period_start: 1, current_period_end: 2, price: { id: "price_creator_test" } }] },
    };
    constructEvent.mockReturnValue({
      id: "evt_ok",
      type: "customer.subscription.created",
      data: { object: subscription },
    });
    createEvent.mockResolvedValue({});
    findFirst.mockResolvedValue({
      id: "subrow",
      workspaceId: "ws_a",
      plan: { code: "FREE" },
      stripeCustomerId: "cus_a",
    });
    findOwner.mockResolvedValue({ user: { email: "owner@example.com" } });
    upsertSub.mockResolvedValue({});
    const { handleStripeWebhook } = await import("@/lib/billing/webhook");
    const result = await handleStripeWebhook({ rawBody: "{}", signature: "sig", ip: "10.0.0.4" });
    expect(result.ok).toBe(true);
    expect(upsertSub).toHaveBeenCalled();
    expect(maybeGrantReferralReward).not.toHaveBeenCalled();
    const update = upsertSub.mock.calls[0][0];
    expect(update.where).toEqual({ workspaceId: "ws_a" });
    expect(update.update.status).toBe("ACTIVE");
  });

  it("marks payment failure without deleting workspace data", async () => {
    setTestStripeEnv();
    constructEvent.mockReturnValue({
      id: "evt_fail",
      type: "invoice.payment_failed",
      data: {
        object: {
          id: "in_1",
          customer: "cus_a",
          amount_due: 1000,
          amount_paid: 0,
          currency: "brl",
          hosted_invoice_url: null,
          metadata: {},
          parent: { subscription_details: { subscription: "sub_ok" } },
        },
      },
    });
    createEvent.mockResolvedValue({});
    findFirst.mockResolvedValue({
      id: "subrow",
      workspaceId: "ws_a",
      plan: { code: "CREATOR" },
      stripeCustomerId: "cus_a",
      status: "ACTIVE",
      gracePeriodEndsAt: null,
    });
    upsertInvoice.mockResolvedValue({});
    updateSub.mockResolvedValue({});
    findOwner.mockResolvedValue({ user: { email: "owner@example.com" } });
    const { handleStripeWebhook } = await import("@/lib/billing/webhook");
    const result = await handleStripeWebhook({ rawBody: "{}", signature: "sig", ip: "10.0.0.5" });
    expect(result.ok).toBe(true);
    expect(updateSub).toHaveBeenCalledWith(expect.objectContaining({
      where: { workspaceId: "ws_a" },
      data: expect.objectContaining({ status: "PAST_DUE" }),
    }));
  });

  it("upgrades Creator to Pro from the Stripe price, not client metadata", async () => {
    setTestStripeEnv();
    const subscription = {
      id: "sub_pro",
      status: "active",
      customer: "cus_a",
      cancel_at_period_end: false,
      metadata: { workspaceId: "ws_a", plan: "CREATOR" },
      items: { data: [{ current_period_start: 1, current_period_end: 2, price: { id: "price_pro_test" } }] },
    };
    constructEvent.mockReturnValue({
      id: "evt_upgrade",
      type: "customer.subscription.updated",
      data: { object: subscription },
    });
    createEvent.mockResolvedValue({});
    findFirst.mockResolvedValue({
      id: "subrow",
      workspaceId: "ws_a",
      plan: { code: "CREATOR" },
      stripeCustomerId: "cus_a",
      currentPeriodStart: new Date("2026-08-01"),
      currentPeriodEnd: new Date("2026-09-01"),
    });
    upsertSub.mockResolvedValue({});
    const { handleStripeWebhook } = await import("@/lib/billing/webhook");
    const result = await handleStripeWebhook({ rawBody: "{}", signature: "sig", ip: "10.0.0.6" });
    expect(result.ok).toBe(true);
    expect(upsertSub.mock.calls[0][0].update.planId).toBe("plan_PRO");
  });

  it("marks cancel_at_period_end without dropping the paid plan yet", async () => {
    setTestStripeEnv();
    const subscription = {
      id: "sub_ok",
      status: "active",
      customer: "cus_a",
      cancel_at_period_end: true,
      metadata: { workspaceId: "ws_a", plan: "PRO" },
      items: { data: [{ current_period_start: 1, current_period_end: 2, price: { id: "price_pro_test" } }] },
    };
    constructEvent.mockReturnValue({
      id: "evt_cancel_end",
      type: "customer.subscription.updated",
      data: { object: subscription },
    });
    createEvent.mockResolvedValue({});
    findFirst.mockResolvedValue({
      id: "subrow",
      workspaceId: "ws_a",
      plan: { code: "PRO" },
      stripeCustomerId: "cus_a",
    });
    upsertSub.mockResolvedValue({});
    const { handleStripeWebhook } = await import("@/lib/billing/webhook");
    const result = await handleStripeWebhook({ rawBody: "{}", signature: "sig", ip: "10.0.0.7" });
    expect(result.ok).toBe(true);
    expect(upsertSub.mock.calls[0][0].update.cancelAtPeriodEnd).toBe(true);
    expect(upsertSub.mock.calls[0][0].update.planId).toBe("plan_PRO");
  });

  it("downgrades to Free after subscription.deleted", async () => {
    setTestStripeEnv();
    const subscription = {
      id: "sub_ok",
      status: "canceled",
      customer: "cus_a",
      cancel_at_period_end: false,
      metadata: { workspaceId: "ws_a", plan: "PRO" },
      items: { data: [{ current_period_start: 1, current_period_end: 2, price: { id: "price_pro_test" } }] },
    };
    constructEvent.mockReturnValue({
      id: "evt_deleted",
      type: "customer.subscription.deleted",
      data: { object: subscription },
    });
    createEvent.mockResolvedValue({});
    findFirst.mockResolvedValue({
      id: "subrow",
      workspaceId: "ws_a",
      plan: { code: "PRO" },
      stripeCustomerId: "cus_a",
    });
    upsertSub.mockResolvedValue({});
    const { handleStripeWebhook } = await import("@/lib/billing/webhook");
    const result = await handleStripeWebhook({ rawBody: "{}", signature: "sig", ip: "10.0.0.8" });
    expect(result.ok).toBe(true);
    expect(upsertSub.mock.calls[0][0].update.planId).toBe("plan_FREE");
  });

  it("ignores a customer that belongs to another workspace", async () => {
    setTestStripeEnv();
    const subscription = {
      id: "sub_other",
      status: "active",
      customer: "cus_other",
      cancel_at_period_end: false,
      metadata: { workspaceId: "ws_a", plan: "PRO" },
      items: { data: [{ current_period_start: 1, current_period_end: 2, price: { id: "price_pro_test" } }] },
    };
    constructEvent.mockReturnValue({
      id: "evt_wrong_ws",
      type: "customer.subscription.updated",
      data: { object: subscription },
    });
    createEvent.mockResolvedValue({});
    findFirst.mockResolvedValue({
      workspaceId: "ws_b",
      plan: { code: "CREATOR" },
      stripeCustomerId: "cus_other",
    });
    const { handleStripeWebhook } = await import("@/lib/billing/webhook");
    const result = await handleStripeWebhook({ rawBody: "{}", signature: "sig", ip: "10.0.0.9" });
    expect(result.ok).toBe(true);
    expect(upsertSub).not.toHaveBeenCalled();
  });

  it("asks the referral rewarder after a paid invoice without trusting the client", async () => {
    setTestStripeEnv();
    constructEvent.mockReturnValue({
      id: "evt_paid_ref",
      type: "invoice.paid",
      data: {
        object: {
          id: "in_paid",
          customer: "cus_a",
          amount_paid: 5990,
          amount_due: 5990,
          currency: "brl",
          hosted_invoice_url: null,
          metadata: {},
          parent: { subscription_details: { subscription: "sub_ok" } },
        },
      },
    });
    createEvent.mockResolvedValue({});
    findFirst.mockResolvedValue({
      id: "subrow",
      workspaceId: "ws_referred",
      plan: { code: "CREATOR" },
      stripeCustomerId: "cus_a",
      status: "ACTIVE",
    });
    upsertInvoice.mockResolvedValue({});
    updateSub.mockResolvedValue({});
    const { handleStripeWebhook } = await import("@/lib/billing/webhook");
    const result = await handleStripeWebhook({ rawBody: "{}", signature: "sig", ip: "10.0.0.10" });
    expect(result.ok).toBe(true);
    expect(maybeGrantReferralReward).toHaveBeenCalledWith(
      expect.objectContaining({
        referredWorkspaceId: "ws_referred",
        paidAmount: 5990,
        stripeEventId: "evt_paid_ref",
        stripeInvoiceId: "in_paid",
      }),
    );
  });
});
