import { beforeEach, describe, expect, it, vi } from "vitest";

const upsert = vi.fn();
const findUnique = vi.fn();
const aggregate = vi.fn();
const count = vi.fn();

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    usageEvent: {
      upsert: (...args: unknown[]) => upsert(...args),
      findUnique: (...args: unknown[]) => findUnique(...args),
      aggregate: (...args: unknown[]) => aggregate(...args),
      create: async () => ({}),
      update: async () => ({}),
    },
    subscription: { findUnique: (...args: unknown[]) => findUnique(...args) },
    socialAccount: { count: (...args: unknown[]) => count(...args) },
    workspaceGrant: { findMany: async () => [] },
    minuteGrant: {
      aggregate: async () => ({ _sum: { remaining: 0 } }),
      findMany: async () => [],
      update: async () => ({}),
    },
  },
}));

describe("usage ledger", () => {
  beforeEach(() => {
    upsert.mockReset();
    findUnique.mockReset();
    aggregate.mockReset();
    count.mockReset();
  });

  it("does not duplicate processing usage on retry", async () => {
    upsert.mockResolvedValue({ id: "evt1", amountSeconds: 34 });
    findUnique.mockResolvedValue(null);
    aggregate.mockResolvedValue({ _sum: { amountSeconds: 34 } });
    const { recordProcessingUsage } = await import("@/lib/billing/usage");
    await recordProcessingUsage({ workspaceId: "ws_a", projectId: "proj-renato", durationMs: 33500 });
    await recordProcessingUsage({ workspaceId: "ws_a", projectId: "proj-renato", durationMs: 33500 });
    expect(upsert).toHaveBeenCalledTimes(2);
    expect(upsert.mock.calls[0]?.[0]).toMatchObject({
      where: { idempotencyKey: "process:proj-renato" },
      update: {},
      create: expect.objectContaining({ amountSeconds: 34, type: "VIDEO_PROCESSING" }),
    });
  });
});
