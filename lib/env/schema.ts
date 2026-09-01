import { z } from "zod";

const emptyToUndefined = (value: unknown) => {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : undefined;
};

const optionalUrl = z.preprocess(emptyToUndefined, z.string().url().optional());
const optionalString = z.preprocess(emptyToUndefined, z.string().min(1).optional());
const optionalBool = z.preprocess((value) => {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value === "boolean") return value;
  const s = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(s)) return true;
  if (["0", "false", "no", "off"].includes(s)) return false;
  return value;
}, z.boolean().optional());

export const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).optional(),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).optional(),
  DATABASE_URL: z.string().min(1, "DATABASE_URL é obrigatório"),
  AUTH_SECRET: optionalString,
  AUTH_URL: optionalUrl,
  AUTH_GOOGLE_ID: optionalString,
  AUTH_GOOGLE_SECRET: optionalString,
  ENCRYPTION_KEY: optionalString,
  REDIS_URL: optionalUrl,
  STORAGE_PROVIDER: z.preprocess(emptyToUndefined, z.enum(["local", "s3", "r2", "b2"]).optional()),
  S3_ENDPOINT: optionalUrl,
  S3_REGION: optionalString,
  S3_BUCKET: optionalString,
  S3_ACCESS_KEY_ID: optionalString,
  S3_SECRET_ACCESS_KEY: optionalString,
  S3_FORCE_PATH_STYLE: optionalBool,
  WORKER_CONCURRENCY: z.preprocess(emptyToUndefined, z.coerce.number().int().positive().optional()),
  MEDIA_BASE_URL: optionalUrl,
  OPENAI_API_KEY: optionalString,
  OPENAI_MODEL: optionalString,
  ALLOW_EXTERNAL_AI_PROCESSING: optionalBool,
  ALLOW_SOCIAL_PUBLISH: optionalBool,
  TIKTOK_CLIENT_KEY: optionalString,
  TIKTOK_CLIENT_ID: optionalString,
  TIKTOK_CLIENT_SECRET: optionalString,
  TIKTOK_REDIRECT_URI: optionalUrl,
  TIKTOK_CONTENT_POSTING_APPROVED: optionalBool,
  META_APP_ID: optionalString,
  META_APP_SECRET: optionalString,
  META_REDIRECT_URI: optionalUrl,
  META_GRAPH_VERSION: optionalString,
  META_MEDIA_BASE_URL: optionalUrl,
  META_INSTAGRAM_PUBLISH_APPROVED: optionalBool,
  META_FACEBOOK_PUBLISH_APPROVED: optionalBool,
  META_INSIGHTS_APPROVED: optionalBool,
  META_WEBHOOK_VERIFY_TOKEN: optionalString,
  X_CLIENT_ID: optionalString,
  X_CLIENT_SECRET: optionalString,
  X_REDIRECT_URI: optionalUrl,
  X_API_TIER: z.preprocess(emptyToUndefined, z.enum(["free", "basic", "pro", "enterprise"]).optional()),
  X_WRITE_ACCESS_APPROVED: optionalBool,
  X_LONG_POSTS: optionalBool,
  GOOGLE_CLIENT_ID: optionalString,
  GOOGLE_CLIENT_SECRET: optionalString,
  GOOGLE_REDIRECT_URI: optionalUrl,
  YOUTUBE_CLIENT_ID: optionalString,
  YOUTUBE_CLIENT_SECRET: optionalString,
  YOUTUBE_REDIRECT_URI: optionalUrl,
  YOUTUBE_UPLOAD_APPROVED: optionalBool,
  YOUTUBE_ANALYTICS_APPROVED: optionalBool,
  YOUTUBE_ANALYTICS_SCOPE: optionalBool,
  YOUTUBE_API_KEY: optionalString,
  GOOGLE_API_KEY: optionalString,
  TRENDING_YOUTUBE_REGION: optionalString,
  TWITCH_CLIENT_ID: optionalString,
  TWITCH_CLIENT_SECRET: optionalString,
  STRIPE_SECRET_KEY: optionalString,
  STRIPE_WEBHOOK_SECRET: optionalString,
  STRIPE_PRICE_CREATOR: optionalString,
  STRIPE_PRICE_BASIC: optionalString,
  STRIPE_PRICE_PLUS: optionalString,
  STRIPE_PRICE_PRO: optionalString,
  STRIPE_PRICE_BUSINESS: optionalString,
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: optionalString,
  STRIPE_PUBLISHABLE_KEY: optionalString,
  EMAIL_PROVIDER: optionalString,
  SMTP_HOST: optionalString,
  SMTP_PORT: z.preprocess(emptyToUndefined, z.coerce.number().int().positive().optional()),
  SMTP_SECURE: optionalBool,
  SMTP_USER: optionalString,
  SMTP_PASSWORD: optionalString,
  SMTP_PASS: optionalString,
  SMTP_FROM: optionalString,
  EMAIL_FROM: optionalString,
  SMTP_FROM_NAME: optionalString,
  RESEND_API_KEY: optionalString,
  APP_URL: optionalUrl,
  SENTRY_DSN: optionalUrl,
  CLIPLAB_EMBED_WORKERS: optionalBool,
  MAX_VIDEO_UPLOAD_BYTES: z.preprocess(emptyToUndefined, z.coerce.number().int().positive().optional()),
  CORS_ORIGINS: optionalString,
  FFMPEG_TIMEOUT_MS: z.preprocess(emptyToUndefined, z.coerce.number().int().positive().optional()),
  FFMPEG_MAX_CONCURRENCY: z.preprocess(emptyToUndefined, z.coerce.number().int().positive().optional()),
  FFMPEG_MAX_DURATION_SEC: z.preprocess(emptyToUndefined, z.coerce.number().int().positive().optional()),
  DEV_MOCK_PROVIDERS: optionalBool,
  ENABLE_DEMO_DATA: optionalBool,
  ENABLE_LIVE_CLIPPING: optionalBool,
  ENABLE_CHAMPIONSHIPS: optionalBool,
  ENABLE_AUTOPOST: optionalBool,
  CLIPLAB_OWNER_NAME: optionalString,
  SOCIAL_PROVIDER: z.preprocess(emptyToUndefined, z.enum(["upload-post", "native", "mock"]).optional()),
  UPLOAD_POST_API_KEY: optionalString,
  UPLOAD_POST_API_BASE: optionalUrl,
  UPLOAD_POST_WEBHOOK_SECRET: optionalString,
});

export type ParsedEnv = z.infer<typeof envSchema>;

export type EnvIssue = { key: string; message: string; essential: boolean };

/** Required to serve traffic and for `/api/ready`. Not required to compile `next build`. */
export const RUNTIME_ESSENTIAL_KEYS = ["DATABASE_URL"] as const;

const ESSENTIAL = new Set<string>(RUNTIME_ESSENTIAL_KEYS);

export function validateProcessEnv(source: NodeJS.ProcessEnv = process.env) {
  const parsed = envSchema.safeParse(source);
  if (parsed.success) {
    return { ok: true as const, data: parsed.data, issues: [] as EnvIssue[] };
  }
  const issues: EnvIssue[] = parsed.error.issues.map((issue) => {
    const key = String(issue.path[0] ?? "unknown");
    return { key, message: issue.message, essential: ESSENTIAL.has(key) };
  });
  return { ok: false as const, data: null, issues };
}

export function essentialEnvErrors(source: NodeJS.ProcessEnv = process.env) {
  return validateProcessEnv(source).issues.filter((issue) => issue.essential);
}

/** Alias for production/runtime checks. Build must not call this to fail compilation. */
export function essentialRuntimeEnvErrors(source: NodeJS.ProcessEnv = process.env) {
  return essentialEnvErrors(source);
}
