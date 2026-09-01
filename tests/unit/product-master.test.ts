import { describe, expect, it } from "vitest";
import { planPriceLabel, PLAN_COMMERCE } from "@/lib/config/plan-commerce";
import { PRODUCT_PLAN_CODES, PLAN_LIMITS } from "@/lib/config/plans";
import { whisperLanguageParam } from "@/lib/transcription/language";
import {
  ONBOARDING_STEPS,
  clampOnboardingStep,
  parseOnboardingGoal,
  parseOnboardingPlan,
  parseOnboardingPlatforms,
} from "@/lib/onboarding/config";
import { parseOutputAspect } from "@/lib/config/output-aspect";
import { changePasswordSchema, createProjectSchema } from "@/lib/validations";
import { renderEmailTemplate } from "@/lib/email/templates";
import { getSupportedPlatforms } from "@/lib/social/upload-post/platforms";
import { studioNavGroups } from "@/lib/config/navigation";

describe("commerce and landing data", () => {
  it("exposes Creator and Pro from real config", () => {
    expect(PLAN_COMMERCE.CREATOR.priceMonthly).toBe(59.9);
    expect(PLAN_COMMERCE.PRO.priceMonthly).toBe(149.9);
    expect(planPriceLabel("CREATOR")).toMatch(/59/);
    expect(planPriceLabel("PRO")).toMatch(/149/);
    expect(PRODUCT_PLAN_CODES).toContain("FREE");
    expect(PLAN_LIMITS.CREATOR.monthlyMinutes).toBe(600);
    expect(PLAN_LIMITS.PRO.monthlyMinutes).toBe(1800);
  });

  it("lists only Upload-Post supported platforms", () => {
    const platforms = getSupportedPlatforms();
    expect(platforms).toContain("TIKTOK");
    expect(platforms).not.toContain("TWITCH");
    expect(platforms).not.toContain("KICK");
  });
});

describe("onboarding", () => {
  it("clamps steps and accepts real goals/plans/platforms", () => {
    expect(clampOnboardingStep(0)).toBe(1);
    expect(clampOnboardingStep(99)).toBe(ONBOARDING_STEPS);
    expect(parseOnboardingGoal("agency")).toBe("agency");
    expect(parseOnboardingGoal("hack")).toBeUndefined();
    expect(parseOnboardingPlan("PRO")).toBe("PRO");
    expect(parseOnboardingPlan("ENTERPRISE")).toBe("FREE");
    expect(parseOnboardingPlatforms(["TIKTOK", "TWITCH", "nope"])).toBe("TIKTOK");
  });
});

describe("create preferences", () => {
  it("defaults aspect and accepts language auto", () => {
    expect(parseOutputAspect("1:1")).toBe("1:1");
    expect(parseOutputAspect("wide")).toBe("9:16");
    const parsed = createProjectSchema.safeParse({
      name: "Projeto",
      sourceKind: "UPLOAD",
      sourceUrl: "",
      language: "auto",
      intervalSeconds: 0,
      clipDuration: "15-30",
      clipCount: 5,
      mode: "AUTOMATIC",
      detectSpeakers: true,
      removeSilences: true,
      autoReframe: true,
      autoCaptions: true,
      viralScore: true,
      generateTitle: true,
      generateDescription: true,
      generateHashtags: true,
      authorized: true,
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.outputAspect).toBe("9:16");
  });
});

describe("password change schema", () => {
  it("requires current password, confirmation and complexity", () => {
    const base = { currentPassword: "oldpass12", password: "newpass12", confirmPassword: "newpass12" };
    expect(changePasswordSchema.safeParse(base).success).toBe(true);
    expect(changePasswordSchema.safeParse({ ...base, confirmPassword: "other123" }).success).toBe(false);
    expect(changePasswordSchema.safeParse({ ...base, password: "short" }).success).toBe(false);
    expect(changePasswordSchema.safeParse({ ...base, currentPassword: "" }).success).toBe(false);
  });
});

describe("whisper language", () => {
  it("omits auto so the API can detect", () => {
    expect(whisperLanguageParam("auto")).toBeUndefined();
    expect(whisperLanguageParam("pt-BR")).toBe("pt");
    expect(whisperLanguageParam("en")).toBe("en");
  });
});

describe("processing email templates", () => {
  it("renders CortaClip processing templates without leaking markup", () => {
    const done = renderEmailTemplate("processing-complete", { name: "<b>x</b>", actionUrl: "https://example.com/studio/projects/1" });
    expect(done.subject).toMatch(/pronto/i);
    expect(done.html).toContain("&lt;b&gt;");
    expect(done.text).toContain("clips");
    const failed = renderEmailTemplate("processing-failed", { name: "Ana" });
    expect(failed.subject).toMatch(/processar/i);
    expect(failed.html).toContain("CortaClip");
    expect(failed.html).not.toContain("CLIPLAB");
  });
});

describe("studio nav", () => {
  it("exposes the product routes without dead primary links", () => {
    const hrefs = studioNavGroups.flatMap((group) => group.items.map((item) => item.href));
    expect(hrefs).toEqual(
      expect.arrayContaining([
        "/studio",
        "/studio/create",
        "/studio/projects",
        "/studio/clips",
        "/studio/publishing",
        "/studio/calendar",
        "/studio/accounts",
        "/studio/analytics",
        "/studio/settings",
      ]),
    );
  });
});
