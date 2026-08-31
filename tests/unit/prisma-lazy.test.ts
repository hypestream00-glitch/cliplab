import { afterEach, describe, expect, it, vi } from "vitest";

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

  it("fails explicitly on first use when DATABASE_URL is missing", async () => {
    vi.stubEnv("DATABASE_URL", "");
    vi.resetModules();
    const { prisma, getPrisma } = await import("@/lib/db/prisma");
    expect(() => getPrisma()).toThrow(/DATABASE_URL is not set/);
    expect(() => prisma.user).toThrow(/DATABASE_URL is not set/);
  });

  it("imports the upload-post webhook route without opening Postgres", async () => {
    vi.stubEnv("DATABASE_URL", "");
    vi.resetModules();
    const route = await import("@/app/api/webhooks/upload-post/route");
    expect(typeof route.POST).toBe("function");
    expect(route.dynamic).toBe("force-dynamic");
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
