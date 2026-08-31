import { afterEach, describe, expect, it } from "vitest";
import { isDemoDataEnabled, shouldRunSeed } from "@/lib/data/demo-mode";
import {
  classifyClip,
  classifyCreditTransaction,
  classifyMetricSnapshot,
  classifyProject,
  classifyPublication,
  classifySocialAccount,
  isUserVisibleNotification,
  snapshotMetricAvailable,
} from "@/lib/data/classify";
import { visibleClipLibraryWhere, visibleProjectWhere, visiblePublicationWhere, visibleSocialAccountWhere } from "@/lib/data/visibility";
import { realSnapshotMetric } from "@/lib/data/metrics-display";

describe("demo mode", () => {
  it("never enables demo data in production", () => {
    expect(isDemoDataEnabled({ NODE_ENV: "production", ENABLE_DEMO_DATA: "true" })).toBe(false);
    expect(isDemoDataEnabled({ NODE_ENV: "production" })).toBe(false);
  });

  it("defaults to disabled in development", () => {
    expect(isDemoDataEnabled({ NODE_ENV: "development" })).toBe(false);
    expect(isDemoDataEnabled({ NODE_ENV: "development", ENABLE_DEMO_DATA: "false" })).toBe(false);
  });

  it("enables only with explicit development flag", () => {
    expect(isDemoDataEnabled({ NODE_ENV: "development", ENABLE_DEMO_DATA: "true" })).toBe(true);
  });

  it("runs seed only when explicitly requested", () => {
    expect(shouldRunSeed(["node", "prisma/seed.ts"], {})).toBe(false);
    expect(shouldRunSeed(["node", "prisma/seed.ts", "--force"], {})).toBe(true);
    expect(shouldRunSeed(["node", "prisma/seed.ts"], { CLIPLAB_RUN_SEED: "true" })).toBe(true);
  });
});

describe("record classification", () => {
  it("keeps real projects and hides seed projects", () => {
    expect(
      classifyProject({
        name: "RENATO GARCIA",
        storageKey: "uploads/abc/video.mp4",
        transcriptProvider: "OPENAI",
        transcriptSourceHash: "0d7dd5b28e855aee696a76ebb51c91de",
      }),
    ).toBe("REAL");
    expect(
      classifyProject({
        name: "Final da copa",
        storageKey: null,
        transcriptProvider: "MOCK",
        transcriptText: "[MOCK] Transcrição de demonstração.",
      }),
    ).toBe("DEMO");
    expect(
      classifyProject({
        name: "Live Ranking #482",
        storageKey: null,
        transcriptProvider: "MOCK",
      }),
    ).toBe("DEMO");
  });

  it("keeps real clips and hides demo clips", () => {
    expect(classifyClip({ storageKey: "clips/a.mp4", projectClass: "REAL" })).toBe("REAL");
    expect(classifyClip({ storageKey: null, projectClass: "DEMO" })).toBe("DEMO");
  });

  it("keeps Upload-Post accounts and hides mock seed accounts", () => {
    expect(
      classifySocialAccount({ mock: false, username: "autoclipsall", provider: "UPLOAD_POST" }),
    ).toBe("REAL");
    expect(
      classifySocialAccount({ mock: true, username: "ana.clips", provider: "NATIVE", externalAccountId: "demo_TIKTOK" }),
    ).toBe("MOCK");
  });

  it("hides seed publications without external evidence", () => {
    expect(
      classifyPublication({
        mock: true,
        provider: "NATIVE",
        caption: "Corte 1 — gerado no CLIPLAB",
        clipProjectClass: "DEMO",
      }),
    ).toBe("MOCK");
    expect(
      classifyPublication({
        mock: false,
        provider: "NATIVE",
        providerPublicationId: null,
        caption: "Corte 6 — gerado no CLIPLAB",
        clipProjectClass: "DEMO",
      }),
    ).toBe("DEMO");
    expect(
      classifyPublication({
        mock: false,
        provider: "UPLOAD_POST",
        providerPublicationId: "up_123",
        clipProjectClass: "REAL",
      }),
    ).toBe("REAL");
  });

  it("hides seed credits and keeps real consumption", () => {
    expect(classifyCreditTransaction({ type: "SUBSCRIPTION_GRANT", amount: 1500, description: "Créditos Plus" })).toBe("DEMO");
    expect(
      classifyCreditTransaction({
        type: "VIDEO_ANALYSIS",
        amount: -1,
        description: "Análise de RENATO GARCIA (1 min reais)",
        reference: "cmtg8etu60001kcurekgxzkv9",
      }),
    ).toBe("REAL");
  });

  it("hides seed analytics and keeps Upload-Post snapshots", () => {
    expect(classifyMetricSnapshot({ accountMock: true, rawPayload: { source: "seed", mocked: true } })).toBe("MOCK");
    expect(classifyMetricSnapshot({ accountMock: false, rawPayload: { source: "upload-post", available: { views: true } } })).toBe(
      "REAL",
    );
    expect(snapshotMetricAvailable({ source: "seed", mocked: true }, "views")).toBe(false);
    expect(snapshotMetricAvailable({ source: "upload-post", available: { views: true } }, "views")).toBe(true);
    expect(snapshotMetricAvailable({ source: "upload-post", available: { views: true } }, "shares")).toBe(false);
    expect(realSnapshotMetric({ views: 2092, likes: 1, comments: 1, shares: 1, rawPayload: { source: "seed", mocked: true } }, "views")).toBeNull();
    expect(
      realSnapshotMetric(
        { views: 2092, likes: 1, comments: 1, shares: 1, rawPayload: { source: "upload-post", available: { views: true } } },
        "views",
      ),
    ).toBe(2092);
  });

  it("hides demo notifications from the product inbox", () => {
    expect(isUserVisibleNotification("Clipes prontos", "3 clipes gerados para RENATO GARCIA.")).toBe(true);
    expect(isUserVisibleNotification("Clipes prontos", "8 clipes gerados em Live Ranking #482.")).toBe(false);
    expect(isUserVisibleNotification("Publicação mock", "Nenhuma publicação real foi feita.")).toBe(false);
    expect(isUserVisibleNotification("Processamento falhou", "RENATO GARCIA: Rate limit da OpenAI (429).")).toBe(false);
  });
});

describe("visibility filters", () => {
  const previousDemo = process.env.ENABLE_DEMO_DATA;

  afterEach(() => {
    if (previousDemo === undefined) delete process.env.ENABLE_DEMO_DATA;
    else process.env.ENABLE_DEMO_DATA = previousDemo;
  });

  it("excludes demo records from normal queries", () => {
    delete process.env.ENABLE_DEMO_DATA;
    expect(visibleProjectWhere("ws1")).toMatchObject({ workspaceId: "ws1", isDemo: false });
    expect(visibleClipLibraryWhere("ws1")).toMatchObject({
      AND: [{ workspaceId: "ws1", project: { isDemo: false } }, { storageKey: { not: null } }],
    });
    expect(visiblePublicationWhere("ws1").mock).toBe(false);
    expect(visibleSocialAccountWhere("ws1").mock).toBe(false);
  });

  it("does not apply demo filters when explicitly enabled in development", () => {
    process.env.ENABLE_DEMO_DATA = "true";
    expect(visibleProjectWhere("ws1").isDemo).toBeUndefined();
    expect(visibleSocialAccountWhere("ws1").mock).toBeUndefined();
  });
});
