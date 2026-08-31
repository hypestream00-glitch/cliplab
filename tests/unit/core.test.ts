import { describe, expect, it } from "vitest";
import { clampScore } from "@/lib/ai/provider";
import { scoreLabel } from "@/lib/utils/format";
import { canUseFeature } from "@/lib/permissions/features";
import { getPlanLimits } from "@/lib/config/plans";
import { creditsForDurationMs } from "@/lib/billing/pricing";
import { hashToken, safeEqual } from "@/lib/security/crypto";

describe("scores", () => {
  it("clamps between 0 and 100", () => {
    expect(clampScore(-10)).toBe(0);
    expect(clampScore(140)).toBe(100);
  });
  it("labels scores without relying only on color", () => {
    expect(scoreLabel(92)).toBe("Excelente");
    expect(scoreLabel(80)).toBe("Muito bom");
    expect(scoreLabel(66)).toBe("Bom");
    expect(scoreLabel(40)).toBe("Regular");
  });
});

describe("plans", () => {
  it("gates live clipping on free and creator", () => {
    expect(canUseFeature("FREE", "liveClipping")).toBe(false);
    expect(canUseFeature("CREATOR", "liveClipping")).toBe(false);
    expect(canUseFeature("PLUS", "liveClipping")).toBe(false);
    expect(canUseFeature("PRO", "liveClipping")).toBe(true);
  });
  it("centralizes product minutes and resolution", () => {
    expect(getPlanLimits("FREE").monthlyMinutes).toBe(60);
    expect(getPlanLimits("FREE").maxResolution).toBe("720p");
    expect(getPlanLimits("CREATOR").monthlyMinutes).toBe(600);
    expect(getPlanLimits("PLUS").monthlyMinutes).toBe(600);
    expect(getPlanLimits("PRO").monthlyMinutes).toBe(1800);
    expect(getPlanLimits("PRO").maxAccounts).toBe(15);
  });
});

describe("credits", () => {
  it("charges one credit per analyzed minute", () => {
    expect(creditsForDurationMs(1)).toBe(1);
    expect(creditsForDurationMs(60_000)).toBe(1);
    expect(creditsForDurationMs(60_001)).toBe(2);
    expect(creditsForDurationMs(48 * 60_000)).toBe(48);
  });
});

describe("security", () => {
  it("hashes tokens deterministically", () => {
    expect(hashToken("abc")).toBe(hashToken("abc"));
    expect(safeEqual("x", "x")).toBe(true);
    expect(safeEqual("x", "y")).toBe(false);
  });
});
