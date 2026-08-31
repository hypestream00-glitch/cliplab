import { stripeSecretMode, stripeWebhookConfigured } from "@/lib/billing/stripe-mode";

export function envPresent(name: string) {
  return Boolean(process.env[name]?.trim());
}

export function envTruthy(name: string) {
  const value = process.env[name]?.trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes" || value === "on";
}

export function integrationStatus() {
  return {
    stripe: stripeSecretMode() === "TEST",
    stripeWebhook: stripeWebhookConfigured(),
    openai: envPresent("OPENAI_API_KEY"),
    redis: envPresent("REDIS_URL"),
    storage: (process.env.STORAGE_PROVIDER === "s3" || process.env.STORAGE_PROVIDER === "r2" || process.env.STORAGE_PROVIDER === "b2") && envPresent("S3_BUCKET") && envPresent("S3_ACCESS_KEY_ID") && envPresent("S3_SECRET_ACCESS_KEY"),
    googleAuth: envPresent("AUTH_GOOGLE_ID") && envPresent("AUTH_GOOGLE_SECRET"),
    tiktok: envPresent("TIKTOK_CLIENT_KEY") || envPresent("TIKTOK_CLIENT_ID") ? envPresent("TIKTOK_CLIENT_SECRET") : false,
    meta: envPresent("META_APP_ID") && envPresent("META_APP_SECRET"),
    x: envPresent("X_CLIENT_ID") && envPresent("X_CLIENT_SECRET"),
    youtube:
      (envPresent("GOOGLE_CLIENT_ID") || envPresent("YOUTUBE_CLIENT_ID") || envPresent("AUTH_GOOGLE_ID")) &&
      (envPresent("GOOGLE_CLIENT_SECRET") || envPresent("YOUTUBE_CLIENT_SECRET") || envPresent("AUTH_GOOGLE_SECRET")),
    uploadPost: envPresent("UPLOAD_POST_API_KEY"),
  };
}

/** True only when a Stripe TEST secret is present. Live keys never count. */
export function isStripeLive() {
  return stripeSecretMode() === "TEST";
}
