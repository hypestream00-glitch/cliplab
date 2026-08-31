import { envTruthy } from "@/lib/env/status";
import { oauthCallbackUrl } from "@/lib/env/app-url";

export const META_GRAPH_VERSION = (process.env.META_GRAPH_VERSION?.trim() || "v26.0").replace(/^\/+/, "");
export const META_AUTHORIZE_URL = `https://www.facebook.com/${META_GRAPH_VERSION}/dialog/oauth`;
export const META_TOKEN_URL = `https://graph.facebook.com/${META_GRAPH_VERSION}/oauth/access_token`;
export const META_GRAPH_BASE = `https://graph.facebook.com/${META_GRAPH_VERSION}`;
export const META_RUPLOAD_BASE = `https://rupload.facebook.com/video-upload/${META_GRAPH_VERSION}`;

/** Facebook Login scopes required for Page discovery + IG professional publishing + insights. */
export const META_SCOPES = [
  "pages_show_list",
  "pages_read_engagement",
  "pages_manage_posts",
  "instagram_basic",
  "instagram_content_publish",
  "instagram_manage_insights",
] as const;

export function metaAppId() {
  return (process.env.META_APP_ID ?? "").trim();
}

export function metaAppSecret() {
  return (process.env.META_APP_SECRET ?? "").trim();
}

export function metaRedirectUri() {
  return oauthCallbackUrl("INSTAGRAM");
}

export function isMetaConfigured() {
  return Boolean(metaAppId() && metaAppSecret());
}

export function metaOAuthStatus(): "CONFIGURED" | "NOT CONFIGURED" {
  return isMetaConfigured() ? "CONFIGURED" : "NOT CONFIGURED";
}

export function metaPublishingStatus(kind: "instagram" | "facebook"): "AVAILABLE" | "APP REVIEW REQUIRED" | "CONFIGURATION REQUIRED" {
  if (!isMetaConfigured()) return "CONFIGURATION REQUIRED";
  const flag = kind === "instagram" ? "META_INSTAGRAM_PUBLISH_APPROVED" : "META_FACEBOOK_PUBLISH_APPROVED";
  if (envTruthy(flag)) return "AVAILABLE";
  return "APP REVIEW REQUIRED";
}

export function metaInsightsStatus(): "AVAILABLE" | "PERMISSION REQUIRED" | "UNKNOWN" {
  if (!isMetaConfigured()) return "PERMISSION REQUIRED";
  if (envTruthy("META_INSIGHTS_APPROVED")) return "AVAILABLE";
  return "UNKNOWN";
}
