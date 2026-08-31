import { describe, expect, it } from "vitest";
import { resolveUsagePeriodStart } from "@/lib/billing/usage-window";
import { getPlanLimits, clampClipCount, clampExportResolution } from "@/lib/config/plans";
import { readFileSync } from "node:fs";
import path from "node:path";

describe("usage window on plan change", () => {
  it("keeps the existing period start when a mid-cycle upgrade resets Stripe's period", () => {
    const existingStart = new Date("2026-08-15T00:00:00.000Z");
    const existingEnd = new Date("2026-09-15T00:00:00.000Z");
    const incomingStart = new Date("2026-08-31T01:08:57.000Z");
    const now = new Date("2026-08-31T01:10:00.000Z");
    expect(
      resolveUsagePeriodStart({
        incomingStart,
        existingStart,
        existingEnd,
        now,
      }),
    ).toEqual(existingStart);
  });

  it("advances the window after the previous period actually ended", () => {
    const existingStart = new Date("2026-07-31T00:00:00.000Z");
    const existingEnd = new Date("2026-08-31T00:00:00.000Z");
    const incomingStart = new Date("2026-08-31T00:00:00.000Z");
    const now = new Date("2026-08-31T00:01:00.000Z");
    expect(
      resolveUsagePeriodStart({
        incomingStart,
        existingStart,
        existingEnd,
        now,
      }),
    ).toEqual(incomingStart);
  });
});

describe("PRO authorization limits", () => {
  it("applies Pro caps from the central plan source used by the backend", () => {
    const pro = getPlanLimits("PRO");
    expect(pro.monthlyMinutes).toBe(1800);
    expect(pro.maxAccounts).toBe(15);
    expect(pro.maxResolution).toBe("1080p");
    expect(pro.maxClipsPerProject).toBe(40);
    expect(clampClipCount("PRO", 41)).toBe(40);
    expect(clampExportResolution("PRO", "1080p")).toBe("1080p");
  });
});

describe("success_url does not activate a plan", () => {
  it("does not call Stripe subscription apply from the success page", () => {
    const source = readFileSync(path.join(process.cwd(), "app/billing/success/page.tsx"), "utf8");
    expect(source).not.toMatch(/applyStripeSubscription|applyLocalPlanChange|startPlanCheckout/);
    expect(source).toMatch(/não ativa o plano/i);
  });
});
