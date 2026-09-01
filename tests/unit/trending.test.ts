import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { computeTrendScore } from "@/lib/trending/score";
import { TRENDING_CATEGORIES, TRENDING_PLATFORMS } from "@/lib/competitions/platforms";
import { studioNavGroups } from "@/lib/config/navigation";

describe("trend score", () => {
  it("returns null when there is no real data", () => {
    expect(computeTrendScore({}).score).toBeNull();
    expect(computeTrendScore({ viewCount: null, views24h: undefined }).reason).toBe("no-data");
  });

  it("does not invent missing metrics", () => {
    const result = computeTrendScore({ viewCount: 10_000 }, new Date("2026-09-01T12:00:00Z"));
    expect(result.score).not.toBeNull();
    expect(result.inputs.views).toBeGreaterThan(0);
    expect(result.inputs.velocity24h).toBeUndefined();
    expect(result.inputs.engagement).toBeUndefined();
  });

  it("ignores negative or non-numeric invented values", () => {
    expect(computeTrendScore({ viewCount: -10, engagement: Number.NaN }).score).toBeNull();
  });
});

describe("trending page and filters", () => {
  it("renders the studio page with official filters and no fake import", () => {
    const page = readFileSync(path.resolve("app/(studio)/studio/trending/page.tsx"), "utf8");
    expect(page).toContain("🔥 Em alta");
    expect(page).toContain("Descubra vídeos e conteúdos com potencial para gerar clips virais.");
    expect(page).toContain("Mais quentes");
    expect(page).toContain("Abrir original");
    expect(page).toContain("✨ Criar clips");
    expect(page).toContain("Fonte ainda não disponível");
    expect(page).toContain("Conecte uma fonte de tendências");
    expect(page).not.toContain("scrape");
    expect(TRENDING_PLATFORMS).toEqual(["YOUTUBE", "TWITCH", "KICK", "TIKTOK", "INSTAGRAM"]);
    expect(TRENDING_CATEGORIES).toContain("Games");
  });

  it("adds Em alta and Campeonatos to the studio nav", () => {
    const hrefs = studioNavGroups.flatMap((group) => group.items.map((item) => item.href));
    expect(hrefs).toContain("/studio/trending");
    expect(hrefs).toContain("/studio/competitions");
    expect(hrefs.indexOf("/studio/trending")).toBeLessThan(hrefs.indexOf("/studio/projects"));
    expect(hrefs.indexOf("/studio/accounts")).toBeLessThan(hrefs.indexOf("/studio/competitions"));
  });
});
