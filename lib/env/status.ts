import { stripeSecretMode, stripeWebhookConfigured } from "@/lib/billing/stripe-mode";

export function envPresent(name: string, source: NodeJS.ProcessEnv = process.env) {
  return Boolean(source[name]?.trim());
}

/** Dynamic `process.env[name]` lookup so Docker `next build` (no secrets) does not freeze empty values. */
export function envValue(name: string, source: NodeJS.ProcessEnv = process.env) {
  return source[name]?.trim() ?? "";
}

export function firstEnvValue(names: readonly string[], source: NodeJS.ProcessEnv = process.env) {
  for (const name of names) {
    const value = envValue(name, source);
    if (value) return value;
  }
  return "";
}

export function envTruthy(name: string, source: NodeJS.ProcessEnv = process.env) {
  const value = source[name]?.trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes" || value === "on";
}

/** Explicit true/false from env, or undefined when unset. */
export function envFlag(name: string, source: NodeJS.ProcessEnv = process.env): boolean | undefined {
  const value = source[name]?.trim().toLowerCase();
  if (!value) return undefined;
  if (["1", "true", "yes", "on"].includes(value)) return true;
  if (["0", "false", "no", "off"].includes(value)) return false;
  return undefined;
}

export function envFlagOrDefault(name: string, fallback: boolean, source: NodeJS.ProcessEnv = process.env) {
  return envFlag(name, source) ?? fallback;
}

/** Production defaults to false so OpenAI is not called until explicitly enabled. Dev/test default true. */
export function externalAiProcessingAllowed(source: NodeJS.ProcessEnv = process.env) {
  return envFlagOrDefault("ALLOW_EXTERNAL_AI_PROCESSING", source.NODE_ENV !== "production", source);
}

/** Production defaults to false so smoke/recovery cannot publish. Dev/test default true. */
export function socialPublishAllowed(source: NodeJS.ProcessEnv = process.env) {
  return envFlagOrDefault("ALLOW_SOCIAL_PUBLISH", source.NODE_ENV !== "production", source);
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
