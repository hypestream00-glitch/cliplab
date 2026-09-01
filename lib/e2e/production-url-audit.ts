import { isLocalhostHost, isPublicHttpsUrl } from "@/lib/env/app-url";

const URL_KEYS = [
  "APP_URL",
  "AUTH_URL",
  "NEXTAUTH_URL",
  "MEDIA_BASE_URL",
  "TIKTOK_REDIRECT_URI",
  "META_REDIRECT_URI",
  "META_MEDIA_BASE_URL",
  "X_REDIRECT_URI",
  "GOOGLE_REDIRECT_URI",
  "YOUTUBE_REDIRECT_URI",
  "UPLOAD_POST_API_BASE",
] as const;

export type ProductionUrlIssue = {
  key: string;
  valueHost: string;
  reason: string;
};

function hostOf(value: string) {
  try {
    return new URL(value).hostname;
  } catch {
    return "";
  }
}

function loopbackInText(value: string) {
  return /localhost|127\.0\.0\.1|host\.docker\.internal/i.test(value);
}

/** Flags production-unsafe origins. Does not mutate env or external dashboards. */
export function auditProductionUrls(source: NodeJS.ProcessEnv = process.env): ProductionUrlIssue[] {
  const issues: ProductionUrlIssue[] = [];
  for (const key of URL_KEYS) {
    const raw = source[key]?.trim();
    if (!raw) continue;
    if (loopbackInText(raw)) {
      issues.push({ key, valueHost: hostOf(raw) || "invalid", reason: "loopback host not allowed in production" });
      continue;
    }
    if ((key === "APP_URL" || key === "AUTH_URL" || key === "MEDIA_BASE_URL") && !isPublicHttpsUrl(raw)) {
      issues.push({ key, valueHost: hostOf(raw) || "invalid", reason: "production public URL must be HTTPS and non-local" });
    }
  }
  const cors = source.CORS_ORIGINS?.trim() ?? "";
  if (cors) {
    for (const origin of cors.split(",").map((item) => item.trim()).filter(Boolean)) {
      if (loopbackInText(origin)) {
        issues.push({
          key: "CORS_ORIGINS",
          valueHost: hostOf(origin) || origin,
          reason: "loopback origin in CORS_ORIGINS",
        });
      }
    }
  }
  for (const [key, value] of Object.entries(source)) {
    if (!key.startsWith("NEXT_PUBLIC_") || !value?.trim()) continue;
    if (loopbackInText(value) && /^https?:\/\//i.test(value.trim())) {
      issues.push({ key, valueHost: hostOf(value) || "invalid", reason: "NEXT_PUBLIC URL points at loopback" });
    }
  }
  const stripeWebhookHint = source.STRIPE_WEBHOOK_URL?.trim();
  if (stripeWebhookHint && loopbackInText(stripeWebhookHint)) {
    issues.push({
      key: "STRIPE_WEBHOOK_URL",
      valueHost: hostOf(stripeWebhookHint) || "invalid",
      reason: "Stripe webhook URL is loopback",
    });
  }
  return issues;
}

export function productionPublicUrlConfigured(source: NodeJS.ProcessEnv = process.env) {
  const app = source.APP_URL?.trim() ?? "";
  return Boolean(app) && isPublicHttpsUrl(app) && !isLocalhostHost(hostOf(app));
}
