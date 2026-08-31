import { describe, expect, it, vi, beforeEach } from "vitest";

const findUnique = vi.fn();
const updateMany = vi.fn();
const customersCreate = vi.fn();
const checkoutCreate = vi.fn();
const portalCreate = vi.fn();

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    subscription: {
      findUnique: (...args: unknown[]) => findUnique(...args),
      updateMany: (...args: unknown[]) => updateMany(...args),
    },
  },
}));

vi.mock("@/lib/billing/stripe-client", () => ({
  getStripeClient: () => ({
    customers: { create: (...args: unknown[]) => customersCreate(...args) },
    checkout: { sessions: { create: (...args: unknown[]) => checkoutCreate(...args) } },
    billingPortal: { sessions: { create: (...args: unknown[]) => portalCreate(...args) } },
  }),
}));

describe("checkout and portal", () => {
  beforeEach(() => {
    findUnique.mockReset();
    updateMany.mockReset();
    customersCreate.mockReset();
    checkoutCreate.mockReset();
    portalCreate.mockReset();
    process.env.STRIPE_SECRET_KEY = "sk_test_cliplab";
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = "pk_test_cliplab";
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_cliplab";
    process.env.STRIPE_PRICE_CREATOR = "price_creator_test";
    process.env.STRIPE_PRICE_PRO = "price_pro_test";
  });

  it("rejects invalid and tampered plans before talking to Stripe", async () => {
    const { startPlanCheckout } = await import("@/lib/billing/stripe");
    expect(await startPlanCheckout({ workspaceId: "ws_a", plan: "price_attacker" })).toMatchObject({ mode: "invalid-plan" });
    expect(await startPlanCheckout({ workspaceId: "ws_a", plan: "BUSINESS" })).toMatchObject({ mode: "invalid-plan" });
    expect(checkoutCreate).not.toHaveBeenCalled();
  });

  it("reuses the persisted customer instead of creating another", async () => {
    findUnique.mockResolvedValue({
      stripeCustomerId: "cus_existing",
      workspace: { members: [{ user: { email: "a@b.com", name: "A" } }], name: "WS" },
    });
    checkoutCreate.mockResolvedValue({ url: "https://checkout.stripe.com/test" });
    const { startPlanCheckout } = await import("@/lib/billing/stripe");
    const result = await startPlanCheckout({ workspaceId: "ws_a", plan: "CREATOR" });
    expect(customersCreate).not.toHaveBeenCalled();
    expect(checkoutCreate).toHaveBeenCalledWith(expect.objectContaining({
      customer: "cus_existing",
      metadata: { workspaceId: "ws_a", plan: "CREATOR" },
    }));
    expect(result).toEqual({ mode: "stripe", url: "https://checkout.stripe.com/test" });
  });

  it("does not accept a client-supplied customer for the portal", async () => {
    findUnique.mockResolvedValue({ stripeCustomerId: "cus_workspace_a" });
    portalCreate.mockResolvedValue({ url: "https://billing.stripe.com/test" });
    const { createBillingPortal } = await import("@/lib/billing/stripe");
    await createBillingPortal({ workspaceId: "ws_a", customerId: "cus_workspace_b" });
    expect(portalCreate).toHaveBeenCalledWith(expect.objectContaining({ customer: "cus_workspace_a" }));
    expect(portalCreate.mock.calls[0][0].customer).not.toBe("cus_workspace_b");
  });

  it("creates a Creator to Pro checkout with the server Pro price only", async () => {
    findUnique.mockResolvedValue({
      stripeCustomerId: "cus_existing",
      workspace: { members: [{ user: { email: "a@b.com", name: "A" } }], name: "WS" },
    });
    checkoutCreate.mockResolvedValue({ url: "https://checkout.stripe.com/c/pay/cs_test_pro" });
    const { startPlanCheckout } = await import("@/lib/billing/stripe");
    const result = await startPlanCheckout({ workspaceId: "ws_a", plan: "PRO" });
    expect(result.mode).toBe("stripe");
    expect(checkoutCreate).toHaveBeenCalledWith(expect.objectContaining({
      customer: "cus_existing",
      line_items: [{ price: "price_pro_test", quantity: 1 }],
      metadata: { workspaceId: "ws_a", plan: "PRO" },
    }));
  });

  it("creates a portal session for the workspace customer with billing return url", async () => {
    findUnique.mockResolvedValue({ stripeCustomerId: "cus_workspace_a" });
    portalCreate.mockResolvedValue({ url: "https://billing.stripe.com/p/session/test" });
    const { createBillingPortal } = await import("@/lib/billing/stripe");
    const result = await createBillingPortal({
      workspaceId: "ws_a",
      returnUrl: "http://localhost:3000/studio/settings/billing",
    });
    expect(result).toEqual({ mode: "stripe", url: "https://billing.stripe.com/p/session/test" });
    expect(portalCreate).toHaveBeenCalledWith({
      customer: "cus_workspace_a",
      return_url: "http://localhost:3000/studio/settings/billing",
    });
  });
});
