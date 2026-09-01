import { describe, expect, it } from "vitest";
import { generateParticipantCode } from "@/lib/competitions/codes";
import { platformFitScores, viralScoreInsights } from "@/lib/config/platform-score";
import { recommendPostingHours } from "@/lib/analytics/best-posting-time";
import { TEMPLATE_CATEGORIES } from "@/lib/services/templates";
import { studioNavGroups } from "@/lib/config/navigation";
import { featureFlags } from "@/lib/features/flags";

const sampleScore = {
  overall: 87,
  hookScore: 90,
  retentionScore: 80,
  clarityScore: 72,
  emotionScore: 84,
  shareabilityScore: 88,
};

describe("creator ecosystem", () => {
  it("generates unique participant codes", () => {
    const codes = new Set(Array.from({ length: 40 }, () => generateParticipantCode()));
    expect(codes.size).toBe(40);
    for (const code of codes) {
      expect(code).toMatch(/^CC-[A-Z0-9]{6}$/);
    }
  });

  it("computes predictive platform scores without claiming official metrics", () => {
    const scores = platformFitScores(sampleScore, 28_000);
    expect(scores.tiktok).toBeGreaterThan(scores.shorts);
    expect(scores.reels).toBeGreaterThan(0);
    expect(scores.tiktok).toBeLessThanOrEqual(100);
    const insights = viralScoreInsights(sampleScore);
    expect(insights.disclaimer).toMatch(/Estimativa/);
    expect(insights.strengths.length).toBeGreaterThan(0);
  });

  it("does not invent posting hours without enough real publications", () => {
    const empty = recommendPostingHours([{ publishedAt: new Date(), views: 10 }]);
    expect(empty.ready).toBe(false);
    expect(empty.message).toContain("mais publicações");

    const monday = new Date(2026, 7, 31, 19, 0, 0);
    const ready = recommendPostingHours(
      [
        { publishedAt: monday, views: 100 },
        { publishedAt: monday, views: 200 },
      ],
      monday,
    );
    expect(ready.ready).toBe(true);
    expect(ready.slots[0]?.time).toBe("19:00");
  });

  it("keeps template categories and compete/tool routes", () => {
    expect(TEMPLATE_CATEGORIES).toContain("Viral");
    const hrefs = studioNavGroups.flatMap((group) => group.items.map((item) => item.href));
    expect(hrefs).toContain("/studio/brand-kit");
    expect(hrefs).toContain("/studio/templates");
    expect(hrefs).toContain("/studio/ranking");
    expect(hrefs).toContain("/studio/live");
    expect(hrefs).toContain("/studio/clients");
  });

  it("does not enable trending flags without platform credentials", () => {
    const prevYt = process.env.YOUTUBE_API_KEY;
    const prevGoogle = process.env.GOOGLE_API_KEY;
    const prevTwitch = process.env.TWITCH_CLIENT_ID;
    const prevSecret = process.env.TWITCH_CLIENT_SECRET;
    delete process.env.YOUTUBE_API_KEY;
    delete process.env.GOOGLE_API_KEY;
    delete process.env.TWITCH_CLIENT_ID;
    delete process.env.TWITCH_CLIENT_SECRET;
    const flags = featureFlags();
    expect(flags.ENABLE_TRENDING_YOUTUBE).toBe(false);
    expect(flags.ENABLE_TRENDING_TWITCH).toBe(false);
    if (prevYt) process.env.YOUTUBE_API_KEY = prevYt;
    if (prevGoogle) process.env.GOOGLE_API_KEY = prevGoogle;
    if (prevTwitch) process.env.TWITCH_CLIENT_ID = prevTwitch;
    if (prevSecret) process.env.TWITCH_CLIENT_SECRET = prevSecret;
  });
});
