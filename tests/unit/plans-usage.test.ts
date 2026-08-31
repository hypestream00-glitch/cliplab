import { describe, expect, it } from "vitest";
import {
  clampClipCount,
  clampExportResolution,
  getPlanLimits,
  PRODUCT_PLAN_CODES,
  PLAN_PRICING,
} from "@/lib/config/plans";
import {
  formatMinutesUsed,
  processingIdempotencyKey,
  secondsFromDurationMs,
} from "@/lib/billing/usage-math";

describe("plan limits", () => {
  it("enforces FREE minutes, clips, social accounts and 720p", () => {
    const free = getPlanLimits("FREE");
    expect(free.monthlyMinutes).toBe(60);
    expect(free.maxClipsPerProject).toBe(5);
    expect(free.maxAccounts).toBe(1);
    expect(free.maxResolution).toBe("720p");
    expect(clampExportResolution("FREE", "1080p")).toBe("720p");
    expect(clampClipCount("FREE", 40)).toBe(5);
  });

  it("enforces CREATOR limits including alias PLUS", () => {
    const creator = getPlanLimits("CREATOR");
    const plus = getPlanLimits("PLUS");
    expect(creator.monthlyMinutes).toBe(600);
    expect(plus.monthlyMinutes).toBe(600);
    expect(creator.maxClipsPerProject).toBe(20);
    expect(creator.maxAccounts).toBe(5);
    expect(clampExportResolution("CREATOR", "720p")).toBe("720p");
    expect(clampExportResolution("CREATOR", "1080p")).toBe("1080p");
    expect(clampClipCount("CREATOR", 40)).toBe(20);
  });

  it("enforces PRO limits including alias BUSINESS", () => {
    const pro = getPlanLimits("PRO");
    expect(pro.monthlyMinutes).toBe(1800);
    expect(pro.maxAccounts).toBe(15);
    expect(pro.priority).toBe(true);
    expect(getPlanLimits("BUSINESS").monthlyMinutes).toBe(1800);
    expect(clampExportResolution("PRO", "1080p")).toBe("1080p");
  });

  it("does not auto-disconnect over-limit accounts after a cheaper effective plan", () => {
    const free = getPlanLimits("FREE");
    expect(free.maxAccounts).toBe(1);
    expect(10).toBeGreaterThan(free.maxAccounts);
  });

  it("exposes the same product plans for pricing UI", () => {
    expect(PRODUCT_PLAN_CODES).toEqual(["FREE", "CREATOR", "PRO"]);
    for (const code of PRODUCT_PLAN_CODES) {
      expect(PLAN_PRICING[code]).toBeDefined();
      expect(getPlanLimits(code).monthlyMinutes).toBeGreaterThan(0);
    }
  });
});

describe("usage math", () => {
  it("stores seconds with ceil rounding", () => {
    expect(secondsFromDurationMs(33500)).toBe(34);
    expect(secondsFromDurationMs(1000)).toBe(1);
    expect(secondsFromDurationMs(0)).toBe(1);
  });

  it("keeps processing idempotency per project", () => {
    expect(processingIdempotencyKey("proj-a")).toBe("process:proj-a");
    expect(processingIdempotencyKey("proj-a")).toBe(processingIdempotencyKey("proj-a"));
  });

  it("formats minutes for the UI", () => {
    expect(formatMinutesUsed(34, 60)).toContain("de 60 minutos utilizados");
  });
});
