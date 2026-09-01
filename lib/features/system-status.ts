import { integrationStatus } from "@/lib/env/status";
import { isFfmpegAvailable } from "@/lib/ffmpeg";
import { prisma } from "@/lib/db/prisma";
import { queueMode, isProductionRuntime } from "@/lib/queue/runtime";
import { workerRuntimeStatus } from "@/lib/queue/heartbeat";
import { oauthCallbackCatalog, publicBaseUrl, mediaUrlIsSafeForExternalApis, isLocalhostHost, isPublicHttpsUrl } from "@/lib/env/app-url";
import { essentialEnvErrors } from "@/lib/env/schema";
import { isMetaReachableBase } from "@/lib/social/meta/media-url";
import { tiktokContentPostingStatus, tiktokOAuthStatus, tiktokRedirectUri } from "@/lib/social/tiktok/config";
import { metaInsightsStatus, metaOAuthStatus, metaPublishingStatus } from "@/lib/social/meta/config";
import { xOAuthStatus, xPublishingStatus } from "@/lib/social/x/config";
import { youtubeUploadStatus, youtubeRedirectUri } from "@/lib/social/youtube/config";
import {
  featureLabel,
  featureState,
  getFeatureAvailability,
  storageFeatureCode,
  type FeatureSnapshot,
  type FeatureCode,
  type FeatureKey,
} from "@/lib/features/availability";
import { setupGuideFor } from "@/lib/features/setup-guides";
import { isUploadPostPrimary, socialBackend } from "@/lib/social/router";
import { isUploadPostConfigured } from "@/lib/social/upload-post/config";
import { getUploadPostStatus, uploadPostWebhookStatus } from "@/lib/social/upload-post/diagnose";
import { emailConfigurationDetail, emailProviderName, isEmailConfigured } from "@/lib/email/config";
import { emailOutboxStats } from "@/lib/email/outbox";
import { billingMissingCategories, isStripeLiveKeyBlocked, stripeSecretMode } from "@/lib/billing/stripe-mode";

export type ReadinessRow = FeatureSnapshot & { id: string; setupId?: string };

function stripeDetail(code: FeatureCode, testSecretPresent: boolean) {
  if (isStripeLiveKeyBlocked()) return "STRIPE MODE: LIVE blocked — use test keys only";
  if (code === "REAL") return "STRIPE MODE: TEST — sem cobrança real";
  const missing = billingMissingCategories();
  if (stripeSecretMode() === "TEST" || testSecretPresent) {
    return `STRIPE MODE: TEST — CONFIGURATION REQUIRED (${missing.join(", ") || "incomplete"})`;
  }
  return "STRIPE MODE: CONFIGURATION REQUIRED";
}

function row(id: string, key: FeatureKey, label: string, code: FeatureCode, detail: string, setupId?: string): ReadinessRow {
  return { id, key, label, code, detail, state: featureState(code), setupId };
}

function hostOf(value: string) {
  try {
    const url = new URL(value.includes("://") ? value : `http://${value}`);
    return url.hostname;
  } catch {
    return "";
  }
}

export async function pingRedis(): Promise<"READY" | "LOCAL FALLBACK" | "CONFIGURATION REQUIRED" | "ERROR"> {
  const url = process.env.REDIS_URL?.trim();
  if (!url) return isProductionRuntime() ? "CONFIGURATION REQUIRED" : "LOCAL FALLBACK";
  try {
    const { redisUsesTls } = await import("@/lib/queue/redis");
    const { cachedRedisPing } = await import("@/lib/queue/redis-health");
    if (url.startsWith("rediss://") && !redisUsesTls()) return "ERROR";
    const ping = await cachedRedisPing();
    if (ping === "ok") return "READY";
    if (ping === "unset") return isProductionRuntime() ? "CONFIGURATION REQUIRED" : "LOCAL FALLBACK";
    return "ERROR";
  } catch {
    return "ERROR";
  }
}

function socialStatusRows(params: {
  env: ReturnType<typeof integrationStatus>;
  features: ReturnType<typeof getFeatureAvailability>;
  tiktokRedirect: string;
  googleRedirect: string;
  tiktokProd: FeatureCode;
  xTier: string;
  xWrite: string;
  mediaSafe: boolean;
  mediaBase: string;
  profileCount: number;
  nativeCode: FeatureCode;
  uploadStatus: Awaited<ReturnType<typeof getUploadPostStatus>>;
  webhookStatus: ReturnType<typeof uploadPostWebhookStatus>;
}): ReadinessRow[] {
  const uploadConfigured = isUploadPostConfigured();
  const statusCode = (value: typeof params.uploadStatus): FeatureCode => {
    if (value === "READY") return "REAL";
    if (value === "CONFIGURATION_REQUIRED") return "CONFIG_REQUIRED";
    if (value === "PLAN_REQUIRED") return "PLAN_REQUIRED";
    if (value === "INVALID_CREDENTIALS") return "ERROR";
    return "ERROR";
  };
  const uploadCode = statusCode(params.uploadStatus);
  const apiDetail = !uploadConfigured
    ? "CONFIGURATION REQUIRED — UPLOAD_POST_API_KEY"
    : params.uploadStatus === "READY"
      ? "READY"
      : params.uploadStatus === "PLAN_REQUIRED"
        ? "PLAN REQUIRED"
        : params.uploadStatus === "INVALID_CREDENTIALS"
          ? "INVALID CREDENTIALS"
          : "ERROR";
  const webhookCode: FeatureCode =
    params.webhookStatus === "READY" ? "REAL" : params.webhookStatus === "OPTIONAL" ? "OPTIONAL" : "CONFIG_REQUIRED";
  if (isUploadPostPrimary()) {
    return [
      row("social-provider", "uploadPost", "Social Provider", "REAL", "Upload-Post", "upload-post"),
      row(
        "upload-post-api",
        "uploadPost",
        "API",
        uploadCode,
        apiDetail,
        "upload-post",
      ),
      row(
        "upload-post-whitelabel",
        "uploadPost",
        "White-label Connect",
        uploadCode,
        apiDetail === "READY" ? "READY" : apiDetail === "PLAN REQUIRED" ? "PLAN REQUIRED" : apiDetail === "INVALID CREDENTIALS" ? "INVALID CREDENTIALS" : uploadConfigured ? "ERROR" : "CONFIGURATION REQUIRED",
        "upload-post",
      ),
      row(
        "upload-post-publishing",
        "uploadPost",
        "Publishing",
        uploadConfigured ? "REAL" : "PLAN_REQUIRED",
        uploadConfigured ? "READY" : "PLAN REQUIRED",
        "upload-post",
      ),
      row(
        "upload-post-scheduling",
        "uploadPost",
        "Scheduling",
        uploadConfigured ? "REAL" : "PLAN_REQUIRED",
        uploadConfigured ? "READY" : "PLAN REQUIRED",
        "upload-post",
      ),
      row(
        "upload-post-analytics",
        "uploadPost",
        "Analytics",
        uploadConfigured ? "REAL" : "PLAN_REQUIRED",
        uploadConfigured ? "READY" : "PLAN REQUIRED",
        "upload-post",
      ),
      row(
        "upload-post-webhooks",
        "uploadPost",
        "Webhooks",
        webhookCode,
        params.webhookStatus === "READY"
          ? "READY"
          : params.webhookStatus === "OPTIONAL"
            ? "OPTIONAL"
            : "CONFIG REQUIRED — UPLOAD_POST_WEBHOOK_SECRET",
        "upload-post",
      ),
      row("upload-post-profiles", "uploadPost", "Connected Profiles", "REAL", String(params.profileCount), "upload-post"),
      row("native-providers", "tiktok", "Providers nativos", params.nativeCode, "LEGACY / DISABLED — fallback SOCIAL_PROVIDER=native"),
    ];
  }
  const { env, features, tiktokRedirect, googleRedirect, tiktokProd, xTier, xWrite, mediaSafe, mediaBase } = params;
  return [
    row("social-provider", "uploadPost", "Social Provider", "UNAVAILABLE", `native (SOCIAL_PROVIDER=${socialBackend()})`),
    row("tiktok-credentials", "tiktok", "TikTok Developer Credentials", env.tiktok ? "REAL" : "CONFIG_REQUIRED", env.tiktok ? "client_key + client_secret presentes" : "TIKTOK_CLIENT_KEY / TIKTOK_CLIENT_SECRET", "tiktok"),
    row("tiktok-oauth", "tiktok", "TikTok OAuth", tiktokOAuthStatus() === "CONFIGURED" ? "REAL" : "CONFIG_REQUIRED", tiktokOAuthStatus(), "tiktok"),
    row(
      "tiktok-posting",
      "tiktok",
      "TikTok Content Posting Approval",
      tiktokContentPostingStatus() === "AVAILABLE" ? "REAL" : tiktokContentPostingStatus() === "NOT_CONFIGURED" ? "CONFIG_REQUIRED" : "APPROVAL_REQUIRED",
      tiktokContentPostingStatus(),
      "tiktok",
    ),
    row(
      "tiktok-redirect",
      "tiktok",
      "TikTok Redirect URI",
      isPublicHttpsUrl(tiktokRedirect) ? "REAL" : isLocalhostHost(hostOf(tiktokRedirect)) ? "LOCAL_ONLY" : "CONFIG_REQUIRED",
      tiktokRedirect,
      "tiktok",
    ),
    row("tiktok-prod", "tiktok", "TikTok Production Readiness", tiktokProd, featureLabel(tiktokProd), "tiktok"),
    row("meta-credentials", "instagram", "Meta App Credentials", env.meta ? "REAL" : "CONFIG_REQUIRED", env.meta ? "META_APP_ID + META_APP_SECRET presentes" : "Preencha META_APP_ID e META_APP_SECRET", "meta"),
    row("meta-login", "facebook", "Facebook Login", metaOAuthStatus() === "CONFIGURED" ? "REAL" : "CONFIG_REQUIRED", metaOAuthStatus(), "meta"),
    row("ig-publish", "instagram", "Instagram Publishing", features.instagram, `Publishing ${metaPublishingStatus("instagram")}`, "meta"),
    row("fb-publish", "facebook", "Facebook Publishing", features.facebook, `Publishing ${metaPublishingStatus("facebook")}`, "meta"),
    row(
      "meta-insights",
      "instagram",
      "Insights",
      metaInsightsStatus() === "AVAILABLE" ? "REAL" : env.meta ? "APPROVAL_REQUIRED" : "CONFIG_REQUIRED",
      metaInsightsStatus(),
      "meta",
    ),
    row(
      "media-base",
      "storage",
      "Media Base URL",
      mediaSafe ? "REAL" : isLocalhostHost(hostOf(mediaBase)) ? "LOCAL_ONLY" : "CONFIG_REQUIRED",
      mediaSafe
        ? "HTTPS público utilizável por APIs externas"
        : "Não envie localhost/file:// para Meta. Defina MEDIA_BASE_URL ou META_MEDIA_BASE_URL com HTTPS.",
      "meta",
    ),
    row("x-credentials", "x", "X Developer Credentials", env.x ? "REAL" : "CONFIG_REQUIRED", env.x ? "X_CLIENT_ID + X_CLIENT_SECRET presentes" : "Preencha X_CLIENT_ID e X_CLIENT_SECRET", "x"),
    row("x-oauth", "x", "X OAuth", xOAuthStatus() === "CONFIGURED" ? "REAL" : "CONFIG_REQUIRED", xOAuthStatus(), "x"),
    row(
      "x-write",
      "x",
      "X Write Access",
      xWrite === "AVAILABLE" ? "REAL" : xWrite === "CONFIGURATION REQUIRED" ? "CONFIG_REQUIRED" : "API_ACCESS_REQUIRED",
      `tier=${xTier} · ${xWrite}`,
      "x",
    ),
    row("yt-credentials", "youtube", "Google OAuth Credentials", env.youtube ? "REAL" : "CONFIG_REQUIRED", env.youtube ? "Client ID/secret presentes" : "GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET", "youtube"),
    row(
      "yt-upload",
      "youtube",
      "Upload Scope",
      youtubeUploadStatus() === "AVAILABLE" ? "REAL" : youtubeUploadStatus() === "CONFIGURATION REQUIRED" ? "CONFIG_REQUIRED" : "APPROVAL_REQUIRED",
      youtubeUploadStatus(),
      "youtube",
    ),
    row(
      "yt-redirect",
      "youtube",
      "YouTube Redirect URI",
      isPublicHttpsUrl(googleRedirect) ? "REAL" : isLocalhostHost(hostOf(googleRedirect)) ? "LOCAL_ONLY" : "CONFIG_REQUIRED",
      googleRedirect,
      "youtube",
    ),
  ];
}

async function emailStatusRows(): Promise<ReadinessRow[]> {
  const configured = isEmailConfigured();
  let stats = { pending: 0, sending: 0, sent: 0, failed: 0, lastSent: null as { type: string; sentAt: Date | null } | null, lastFailed: null as { type: string; updatedAt: Date } | null };
  try {
    stats = await emailOutboxStats();
  } catch {
    stats = { pending: 0, sending: 0, sent: 0, failed: 0, lastSent: null, lastFailed: null };
  }
  const smtpCode: FeatureCode = configured ? "REAL" : "CONFIG_REQUIRED";
  return [
    row("email-provider", "smtp", "EMAIL PROVIDER", smtpCode, emailProviderName(), "smtp"),
    row(
      "smtp",
      "smtp",
      "SMTP CONFIGURATION",
      smtpCode,
      configured ? "CONNECTED" : emailConfigurationDetail(),
      "smtp",
    ),
    row(
      "email-outbox",
      "smtp",
      "OUTBOX",
      "REAL",
      `PENDING ${stats.pending} · SENDING ${stats.sending} · SENT ${stats.sent} · FAILED ${stats.failed}`,
      "smtp",
    ),
    row(
      "email-last",
      "smtp",
      "LAST DELIVERY",
      stats.lastSent?.sentAt ? "REAL" : "OPTIONAL",
      stats.lastSent?.sentAt ? `${stats.lastSent.type} · ${stats.lastSent.sentAt.toISOString()}` : "Nenhum envio ainda",
      "smtp",
    ),
    row(
      "email-failed",
      "smtp",
      "FAILED EMAILS",
      stats.failed > 0 ? "ERROR" : "OPTIONAL",
      stats.failed > 0 ? `${stats.failed} falha(s)${stats.lastFailed ? ` · ${stats.lastFailed.type}` : ""}` : "Nenhuma falha",
      "smtp",
    ),
  ];
}

export async function getSystemStatus(): Promise<ReadinessRow[]> {
  const env = integrationStatus();
  const features = getFeatureAvailability();
  let database: FeatureCode = "REAL";
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    database = "ERROR";
  }
  const ffmpeg = (await isFfmpegAvailable()) ? "REAL" : "ERROR";
  const storage = storageFeatureCode();
  const redisPing = await pingRedis();
  const redisCode: FeatureCode =
    redisPing === "READY" ? "REAL" : redisPing === "ERROR" ? "ERROR" : redisPing === "CONFIGURATION REQUIRED" ? "CONFIG_REQUIRED" : "LOCAL_ONLY";
  const queue = queueMode();
  const queueCode: FeatureCode =
    queue === "redis" && redisPing === "READY" ? "REAL" : queue === "local" ? "LOCAL_ONLY" : "ERROR";
  const workerLive = await workerRuntimeStatus();
  const workerCode: FeatureCode =
    workerLive === "CONNECTED"
      ? queue === "redis"
        ? "REAL"
        : "LOCAL_ONLY"
      : queue === "unavailable" || isProductionRuntime()
        ? "ERROR"
        : "CONFIG_REQUIRED";
  const mediaBase = publicBaseUrl();
  const mediaSafe = mediaUrlIsSafeForExternalApis(mediaBase) || isMetaReachableBase();
  const essential = essentialEnvErrors();
  const appCode: FeatureCode = essential.length ? "ERROR" : "REAL";
  const tiktokRedirect = tiktokRedirectUri();
  const googleRedirect = youtubeRedirectUri();
  const tiktokProd: FeatureCode =
    features.tiktok === "REAL" && isPublicHttpsUrl(tiktokRedirect) ? "REAL" : features.tiktok === "CONFIG_REQUIRED" ? "CONFIG_REQUIRED" : "APPROVAL_REQUIRED";
  const xTier = (process.env.X_API_TIER ?? "").trim().toLowerCase() || "unset";
  const xWrite = xPublishingStatus();

  let profileCount = 0;
  try {
    profileCount = await prisma.uploadPostProfile.count();
  } catch {
    profileCount = 0;
  }
  const nativeCode: FeatureCode = isUploadPostPrimary() ? "UNAVAILABLE" : "LOCAL_ONLY";
  const uploadStatus = await getUploadPostStatus().catch((): "ERROR" => "ERROR");
  const webhookStatus = uploadPostWebhookStatus();

  return [
    row("app", "app", "App", appCode, essential.length ? `Env essencial ausente: ${essential.map((i) => i.key).join(", ")}` : `Base ${mediaBase}`),
    row("database", "database", "Database", database, database === "REAL" ? "PostgreSQL respondendo" : "Falha ao consultar o banco"),
    row(
      "storage",
      "storage",
      "Storage",
      storage,
      storage === "LOCAL_ONLY" || storage === "ERROR"
        ? "LOCAL"
        : storage === "REAL"
          ? "S3 CONNECTED"
          : "CONFIGURATION REQUIRED",
    ),
    row(
      "direct-r2-upload",
      "storage",
      "Direct R2 upload",
      storage === "REAL" ? "REAL" : storage === "LOCAL_ONLY" ? "LOCAL_ONLY" : storage,
      storage === "REAL" ? "READY" : storage === "LOCAL_ONLY" ? "LOCAL PUT via Next stream" : "CONFIGURATION REQUIRED",
    ),
    row("ffmpeg", "ffmpeg", "FFmpeg", ffmpeg, ffmpeg === "REAL" ? "REAL" : "ERROR"),
    row(
      "openai",
      "openai",
      "OpenAI",
      env.openai ? "REAL" : "CONFIG_REQUIRED",
      env.openai ? "CONNECTED" : "ERROR",
      "openai",
    ),
    row(
      "transcription-provider",
      "openai",
      "Transcription Provider",
      env.openai ? "REAL" : "CONFIG_REQUIRED",
      env.openai ? "REAL" : "CONFIGURATION REQUIRED",
      "openai",
    ),
    row(
      "clip-analysis-provider",
      "openai",
      "Clip Analysis Provider",
      env.openai ? "REAL" : "CONFIG_REQUIRED",
      env.openai ? "REAL" : "CONFIGURATION REQUIRED",
      "openai",
    ),
    row(
      "redis",
      "redis",
      "Redis",
      redisCode,
      redisPing === "READY" ? "CONNECTED" : redisPing === "LOCAL FALLBACK" ? "LOCAL FALLBACK" : redisPing === "ERROR" ? "ERROR" : "CONFIGURATION REQUIRED",
    ),
    row(
      "worker",
      "worker",
      "Worker",
      workerCode,
      workerLive === "CONNECTED" ? "CONNECTED" : "NOT RUNNING",
    ),
    row(
      "queue",
      "redis",
      "Queue",
      queueCode,
      queue === "redis" && redisPing === "READY" ? "READY" : queue === "local" ? "READY" : "ERROR",
    ),
    ...socialStatusRows({
      env,
      features,
      tiktokRedirect,
      googleRedirect,
      tiktokProd,
      xTier,
      xWrite,
      mediaSafe,
      mediaBase,
      profileCount,
      nativeCode,
      uploadStatus,
      webhookStatus,
    }),
    row("stripe", "stripe", "Stripe", features.stripe, stripeDetail(features.stripe, env.stripe), "stripe"),
    ...(await emailStatusRows()),
  ];
}

export function publicCallbackUrls() {
  return oauthCallbackCatalog().map((item) => ({ ...item }));
}

export { setupGuideFor };
