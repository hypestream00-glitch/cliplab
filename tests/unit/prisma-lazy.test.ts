import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/server", () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({ body, status: init?.status ?? 200 }),
    redirect: (url: URL | string) => ({ url: String(url) }),
  },
  NextRequest: class {},
  after: (fn: () => unknown) => {
    void fn();
  },
}));

const ROUTE_MODULES = [
  "@/app/api/social/meta/data-deletion/route",
  "@/app/api/social/meta/deauthorize/route",
  "@/app/api/social/meta/webhook/route",
  "@/app/api/webhooks/upload-post/route",
  "@/app/api/webhooks/stripe/route",
  "@/app/api/ready/route",
  "@/app/api/v1/projects/route",
  "@/app/api/v1/jobs/[id]/route",
] as const;

describe("lazy prisma", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("can import the client module without DATABASE_URL", async () => {
    vi.stubEnv("DATABASE_URL", "");
    vi.resetModules();
    const mod = await import("@/lib/db/prisma");
    expect(mod.isDatabaseUrlConfigured()).toBe(false);
    expect(mod.prisma).toBeTypeOf("object");
  });

  it("is not a thenable so Next.js cannot await the export at build", async () => {
    vi.stubEnv("DATABASE_URL", "");
    vi.resetModules();
    const { prisma } = await import("@/lib/db/prisma");
    expect(Reflect.get(prisma, "then")).toBeUndefined();
    await expect(Promise.resolve(prisma)).resolves.toBe(prisma);
  });

  it("fails explicitly on first use when DATABASE_URL is missing", async () => {
    vi.stubEnv("DATABASE_URL", "");
    vi.resetModules();
    const { prisma, getPrisma } = await import("@/lib/db/prisma");
    expect(() => getPrisma()).toThrow(/DATABASE_URL is not set/);
    expect(() => prisma.user).toThrow(/DATABASE_URL is not set/);
  });

  it.each(ROUTE_MODULES)("imports %s without DATABASE_URL", async (specifier) => {
    vi.stubEnv("DATABASE_URL", "");
    vi.resetModules();
    await expect(import(specifier)).resolves.toBeTypeOf("object");
  }, 15_000);

  it("imports stripe webhook handler without DATABASE_URL", async () => {
    vi.stubEnv("DATABASE_URL", "");
    vi.resetModules();
    const mod = await import("@/lib/billing/webhook");
    expect(typeof mod.handleStripeWebhook).toBe("function");
  });
});

describe("next build phase", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("does not embed workers during production compile", async () => {
    vi.stubEnv("NEXT_PHASE", "phase-production-build");
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("CLIPLAB_EMBED_WORKERS", "true");
    vi.resetModules();
    const { ensureDevWorkers } = await import("@/lib/queue/boot");
    const { isNextBuildPhase } = await import("@/lib/env/build-phase");
    expect(isNextBuildPhase()).toBe(true);
    expect(() => ensureDevWorkers()).not.toThrow();
  });
});
