import { describe, expect, it } from "vitest";
import { featureLabel, getFeatureAvailability } from "@/lib/features/availability";
import { parseNotificationPrefs, notificationAllowed, DEFAULT_NOTIFICATION_PREFS } from "@/lib/notifications/prefs";
import { canCancelPublication } from "@/lib/social/publication-status";

describe("feature availability", () => {
  it("marks missing OpenAI and Stripe as configuration required", () => {
    const prevOpen = process.env.OPENAI_API_KEY;
    const prevStripe = process.env.STRIPE_SECRET_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.STRIPE_SECRET_KEY;
    const status = getFeatureAvailability();
    expect(status.openai).toBe("CONFIG_REQUIRED");
    expect(status.stripe).toBe("CONFIG_REQUIRED");
    expect(status.storage).toBe("LOCAL_ONLY");
    expect(featureLabel("CONFIG_REQUIRED")).toBe("CONFIGURAÇÃO NECESSÁRIA");
    if (prevOpen) process.env.OPENAI_API_KEY = prevOpen;
    if (prevStripe) process.env.STRIPE_SECRET_KEY = prevStripe;
  });

  it("does not treat social platforms as REAL without credentials", () => {
    const prev = {
      tiktok: process.env.TIKTOK_CLIENT_KEY,
      secret: process.env.TIKTOK_CLIENT_SECRET,
      metaId: process.env.META_APP_ID,
      metaSecret: process.env.META_APP_SECRET,
      xId: process.env.X_CLIENT_ID,
      xSecret: process.env.X_CLIENT_SECRET,
      gId: process.env.GOOGLE_CLIENT_ID,
      gSecret: process.env.GOOGLE_CLIENT_SECRET,
      authId: process.env.AUTH_GOOGLE_ID,
      authSecret: process.env.AUTH_GOOGLE_SECRET,
      ytId: process.env.YOUTUBE_CLIENT_ID,
      ytSecret: process.env.YOUTUBE_CLIENT_SECRET,
      uploadPost: process.env.UPLOAD_POST_API_KEY,
    };
    for (const key of Object.keys(prev)) {
      delete process.env[
        {
          tiktok: "TIKTOK_CLIENT_KEY",
          secret: "TIKTOK_CLIENT_SECRET",
          metaId: "META_APP_ID",
          metaSecret: "META_APP_SECRET",
          xId: "X_CLIENT_ID",
          xSecret: "X_CLIENT_SECRET",
          gId: "GOOGLE_CLIENT_ID",
          gSecret: "GOOGLE_CLIENT_SECRET",
          authId: "AUTH_GOOGLE_ID",
          authSecret: "AUTH_GOOGLE_SECRET",
          ytId: "YOUTUBE_CLIENT_ID",
          ytSecret: "YOUTUBE_CLIENT_SECRET",
          uploadPost: "UPLOAD_POST_API_KEY",
        }[key as keyof typeof prev]
      ];
    }
    delete process.env.TIKTOK_CLIENT_ID;
    const status = getFeatureAvailability();
    expect(status.tiktok).toBe("CONFIG_REQUIRED");
    expect(status.instagram).toBe("CONFIG_REQUIRED");
    expect(status.facebook).toBe("CONFIG_REQUIRED");
    expect(status.x).toBe("CONFIG_REQUIRED");
    expect(status.youtube).toBe("CONFIG_REQUIRED");
    Object.entries(prev).forEach(([key, value]) => {
      if (!value) return;
      const envKey = {
        tiktok: "TIKTOK_CLIENT_KEY",
        secret: "TIKTOK_CLIENT_SECRET",
        metaId: "META_APP_ID",
        metaSecret: "META_APP_SECRET",
        xId: "X_CLIENT_ID",
        xSecret: "X_CLIENT_SECRET",
        gId: "GOOGLE_CLIENT_ID",
        gSecret: "GOOGLE_CLIENT_SECRET",
        authId: "AUTH_GOOGLE_ID",
        authSecret: "AUTH_GOOGLE_SECRET",
        ytId: "YOUTUBE_CLIENT_ID",
        ytSecret: "YOUTUBE_CLIENT_SECRET",
        uploadPost: "UPLOAD_POST_API_KEY",
      }[key];
      if (envKey) process.env[envKey] = value;
    });
  });
});

describe("notification prefs", () => {
  it("defaults and filters types", () => {
    expect(parseNotificationPrefs(null)).toEqual(DEFAULT_NOTIFICATION_PREFS);
    const off = parseNotificationPrefs({ clipsReady: false, publishing: false });
    expect(notificationAllowed("CLIPS_READY", off)).toBe(false);
    expect(notificationAllowed("PUBLISH_FAILED", off)).toBe(false);
    expect(notificationAllowed("PROCESSING_FAILED", off)).toBe(true);
    expect(notificationAllowed("SUBSCRIPTION", parseNotificationPrefs({ billing: false }))).toBe(false);
  });
});

describe("publication cancel", () => {
  it("allows draft scheduled queued only", () => {
    expect(canCancelPublication("DRAFT")).toBe(true);
    expect(canCancelPublication("SCHEDULED")).toBe(true);
    expect(canCancelPublication("QUEUED")).toBe(true);
    expect(canCancelPublication("PUBLISHED")).toBe(false);
    expect(canCancelPublication("UPLOADING")).toBe(false);
    expect(canCancelPublication("PROCESSING")).toBe(false);
  });
});
