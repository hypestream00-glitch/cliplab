import { envPresent } from "@/lib/env/status";
import { isTikTokConfigured, tiktokContentPostingStatus } from "@/lib/social/tiktok/config";
import { isMetaConfigured, metaPublishingStatus } from "@/lib/social/meta/config";
import { isXConfigured, xPublishingStatus } from "@/lib/social/x/config";
import { isYouTubeConfigured, youtubeUploadStatus } from "@/lib/social/youtube/config";
import { isUploadPostPrimary, socialBackend } from "@/lib/social/router";
import { isUploadPostConfigured } from "@/lib/social/upload-post/config";
import { emailProviderStatus } from "@/lib/email/status";
import { isStripeLiveKeyBlocked, isStripeTestReady } from "@/lib/billing/stripe-mode";

export type FeatureCode =
  | "REAL"
  | "CONFIG_REQUIRED"
  | "APPROVAL_REQUIRED"
  | "API_ACCESS_REQUIRED"
  | "LOCAL_ONLY"
  | "MOCK"
  | "UNAVAILABLE"
  | "ERROR"
  | "PLAN_REQUIRED"
  | "OPTIONAL";

export type SystemState =
  | "READY"
  | "LOCAL FALLBACK"
  | "CONFIGURATION REQUIRED"
  | "APPROVAL REQUIRED"
  | "UNAVAILABLE"
  | "ERROR"
  | "PLAN REQUIRED"
  | "OPTIONAL";

export type FeatureKey =
  | "app"
  | "openai"
  | "tiktok"
  | "instagram"
  | "facebook"
  | "x"
  | "youtube"
  | "storage"
  | "stripe"
  | "ffmpeg"
  | "redis"
  | "database"
  | "smtp"
  | "worker"
  | "uploadPost";

export type FeatureSnapshot = {
  key: FeatureKey;
  label: string;
  code: FeatureCode;
  state: SystemState;
  detail: string;
};

export function featureState(code: FeatureCode): SystemState {
  if (code === "REAL") return "READY";
  if (code === "LOCAL_ONLY" || code === "MOCK") return "LOCAL FALLBACK";
  if (code === "CONFIG_REQUIRED") return "CONFIGURATION REQUIRED";
  if (code === "PLAN_REQUIRED") return "PLAN REQUIRED";
  if (code === "OPTIONAL") return "OPTIONAL";
  if (code === "APPROVAL_REQUIRED" || code === "API_ACCESS_REQUIRED") return "APPROVAL REQUIRED";
  if (code === "ERROR") return "ERROR";
  return "UNAVAILABLE";
}

function openaiCode(): FeatureCode {
  return envPresent("OPENAI_API_KEY") ? "REAL" : "CONFIG_REQUIRED";
}

function tiktokCode(): FeatureCode {
  if (isUploadPostPrimary()) return isUploadPostConfigured() ? "REAL" : "CONFIG_REQUIRED";
  if (!isTikTokConfigured()) return "CONFIG_REQUIRED";
  return tiktokContentPostingStatus() === "AVAILABLE" ? "REAL" : "APPROVAL_REQUIRED";
}

function instagramCode(): FeatureCode {
  if (isUploadPostPrimary()) return isUploadPostConfigured() ? "REAL" : "CONFIG_REQUIRED";
  if (!isMetaConfigured()) return "CONFIG_REQUIRED";
  return metaPublishingStatus("instagram") === "AVAILABLE" ? "REAL" : "APPROVAL_REQUIRED";
}

function facebookCode(): FeatureCode {
  if (isUploadPostPrimary()) return isUploadPostConfigured() ? "REAL" : "CONFIG_REQUIRED";
  if (!isMetaConfigured()) return "CONFIG_REQUIRED";
  return metaPublishingStatus("facebook") === "AVAILABLE" ? "REAL" : "APPROVAL_REQUIRED";
}

function xCode(): FeatureCode {
  if (isUploadPostPrimary()) return isUploadPostConfigured() ? "REAL" : "CONFIG_REQUIRED";
  if (!isXConfigured()) return "CONFIG_REQUIRED";
  const status = xPublishingStatus();
  if (status === "AVAILABLE") return "REAL";
  if (status === "PLAN REQUIRED" || status === "API ACCESS REQUIRED") return "API_ACCESS_REQUIRED";
  return "APPROVAL_REQUIRED";
}

function youtubeCode(): FeatureCode {
  if (isUploadPostPrimary()) return isUploadPostConfigured() ? "REAL" : "CONFIG_REQUIRED";
  if (!isYouTubeConfigured()) return "CONFIG_REQUIRED";
  return youtubeUploadStatus() === "AVAILABLE" ? "REAL" : "APPROVAL_REQUIRED";
}

function uploadPostCode(): FeatureCode {
  if (socialBackend() === "native") return "UNAVAILABLE";
  return isUploadPostConfigured() ? "REAL" : "CONFIG_REQUIRED";
}

export function storageFeatureCode(): FeatureCode {
  const provider = (process.env.STORAGE_PROVIDER ?? "local").toLowerCase();
  if (provider === "s3" || provider === "r2" || provider === "b2") {
    return envPresent("S3_BUCKET") && envPresent("S3_ACCESS_KEY_ID") && envPresent("S3_SECRET_ACCESS_KEY")
      ? "REAL"
      : "CONFIG_REQUIRED";
  }
  if (process.env.NODE_ENV === "production") return "ERROR";
  return "LOCAL_ONLY";
}

function stripeCode(): FeatureCode {
  if (isStripeLiveKeyBlocked()) return "ERROR";
  return isStripeTestReady() ? "REAL" : "CONFIG_REQUIRED";
}

function redisCode(): FeatureCode {
  if (envPresent("REDIS_URL")) return "REAL";
  return process.env.NODE_ENV === "production" ? "CONFIG_REQUIRED" : "LOCAL_ONLY";
}

export function getFeatureAvailability(): Record<FeatureKey, FeatureCode> {
  return {
    app: "REAL",
    openai: openaiCode(),
    tiktok: tiktokCode(),
    instagram: instagramCode(),
    facebook: facebookCode(),
    x: xCode(),
    youtube: youtubeCode(),
    storage: storageFeatureCode(),
    stripe: stripeCode(),
    ffmpeg: "UNAVAILABLE",
    redis: redisCode(),
    database: "REAL",
    smtp: emailProviderStatus() === "CONFIGURED" ? "REAL" : "CONFIG_REQUIRED",
    worker: "LOCAL_ONLY",
    uploadPost: uploadPostCode(),
  };
}

export function featureLabel(code: FeatureCode) {
  if (code === "REAL") return "REAL";
  if (code === "CONFIG_REQUIRED") return "CONFIGURAÇÃO NECESSÁRIA";
  if (code === "APPROVAL_REQUIRED") return "APROVAÇÃO NECESSÁRIA";
  if (code === "API_ACCESS_REQUIRED") return "ACESSO DE API NECESSÁRIO";
  if (code === "LOCAL_ONLY") return "SOMENTE LOCAL";
  if (code === "MOCK") return "MOCK";
  if (code === "PLAN_REQUIRED") return "PLANO NECESSÁRIO";
  if (code === "OPTIONAL") return "OPCIONAL";
  if (code === "ERROR") return "ERROR";
  return "INDISPONÍVEL";
}
