import { isUploadPostPrimary } from "@/lib/social/router";
import { brand } from "@/lib/config/brand";

const CALLBACK_PATH = "/api/social/oauth/callback";
const DEV_ORIGIN = "http://localhost:3000";

export type PublicOriginInput = {
  env?: NodeJS.ProcessEnv;
  headers?: Headers | Record<string, string | null | undefined>;
  requestUrl?: string;
};

function envOf(input?: PublicOriginInput) {
  return input?.env ?? process.env;
}

function isProductionEnv(source: NodeJS.ProcessEnv) {
  return (source.NODE_ENV ?? process.env.NODE_ENV) === "production";
}

export function isLoopbackOrBindHost(hostname: string) {
  const host = hostname.trim().toLowerCase().replace(/^\[|\]$/g, "");
  return (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "0.0.0.0" ||
    host === "::" ||
    host === "::1" ||
    host === "ip6-localhost"
  );
}

export function isLocalhostHost(hostname: string) {
  const host = hostname.toLowerCase();
  return isLoopbackOrBindHost(host) || host.endsWith(".local");
}

function isPrivateIpv4(host: string) {
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!match) return false;
  const a = Number(match[1]);
  const b = Number(match[2]);
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return false;
}

export function isUnusablePublicHostname(hostname: string) {
  const host = hostname.trim().toLowerCase().replace(/^\[|\]$/g, "").split("%")[0] ?? "";
  if (!host) return true;
  if (isLoopbackOrBindHost(host)) return true;
  if (host.endsWith(".local") || host.endsWith(".internal")) return true;
  if (isPrivateIpv4(host)) return true;
  return false;
}

function headerValue(headers: PublicOriginInput["headers"], name: string) {
  if (!headers) return "";
  if (typeof (headers as Headers).get === "function") {
    return (headers as Headers).get(name)?.trim() ?? "";
  }
  const record = headers as Record<string, string | null | undefined>;
  const direct = record[name] ?? record[name.toLowerCase()];
  return typeof direct === "string" ? direct.trim() : "";
}

export function originFromCandidate(raw: string | undefined | null, source: NodeJS.ProcessEnv = process.env): string | null {
  const value = raw?.trim().replace(/\/$/, "") ?? "";
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (url.username || url.password) return null;
    if (isUnusablePublicHostname(url.hostname)) return null;
    if (isProductionEnv(source) && url.protocol !== "https:") return null;
    return url.origin;
  } catch {
    return null;
  }
}

function originFromForwardedHeaders(input: PublicOriginInput, source: NodeJS.ProcessEnv): string | null {
  const forwardedHost = headerValue(input.headers, "x-forwarded-host").split(",")[0]?.trim() ?? "";
  const forwardedProto = headerValue(input.headers, "x-forwarded-proto").split(",")[0]?.trim().toLowerCase() ?? "";
  const hostHeader = headerValue(input.headers, "host").split(",")[0]?.trim() ?? "";
  const host = forwardedHost || hostHeader;
  if (!host) return null;
  const hostname = host.replace(/^\[|\]$/g, "").split(":")[0] ?? "";
  if (isUnusablePublicHostname(hostname)) return null;
  const proto = forwardedProto === "http" || forwardedProto === "https" ? forwardedProto : isProductionEnv(source) ? "https" : "http";
  return originFromCandidate(`${proto}://${host}`, source);
}

export function resolvePublicOrigin(input: PublicOriginInput = {}) {
  const source = envOf(input);
  const fromEnv =
    originFromCandidate(source.APP_URL, source) ||
    originFromCandidate(source.AUTH_URL, source) ||
    originFromCandidate(source.NEXTAUTH_URL, source);
  if (fromEnv) return fromEnv;

  const fromHeaders = originFromForwardedHeaders(input, source);
  if (fromHeaders) return fromHeaders;

  const fromRequest = originFromCandidate(input.requestUrl, source);
  if (fromRequest) return fromRequest;

  if (isProductionEnv(source)) return brand.url.replace(/\/$/, "");
  return DEV_ORIGIN;
}

export function publicOrigin(input: PublicOriginInput = {}) {
  return resolvePublicOrigin(input);
}

export function publicBaseUrl() {
  return publicOrigin();
}

export function publicAppPath(path: string) {
  const safe = path.startsWith("/") && !path.startsWith("//") ? path : "/";
  return safe;
}

export function publicAppUrl(path: string, input: PublicOriginInput = {}) {
  return `${publicOrigin(input)}${publicAppPath(path)}`;
}

export function publicRedirectUrl(path: string, input: PublicOriginInput = {}) {
  return new URL(publicAppUrl(path, input));
}

export function publicOriginFromRequest(request: Request) {
  return publicOrigin({
    headers: request.headers,
    requestUrl: request.url,
  });
}

export function publicRedirectFromRequest(path: string, request: Request) {
  return publicRedirectUrl(path, {
    headers: request.headers,
    requestUrl: request.url,
  });
}

export function accountsErrorPath(code: string) {
  return `/studio/accounts?error=${encodeURIComponent(code)}`;
}

export function accountsConnectedPath(value: string) {
  return `/studio/accounts?connected=${encodeURIComponent(value)}`;
}

export function oauthCallbackUrl(platform?: "TIKTOK" | "INSTAGRAM" | "FACEBOOK" | "X" | "YOUTUBE") {
  if (platform === "TIKTOK" && process.env.TIKTOK_REDIRECT_URI?.trim()) return process.env.TIKTOK_REDIRECT_URI.trim();
  if ((platform === "INSTAGRAM" || platform === "FACEBOOK") && process.env.META_REDIRECT_URI?.trim()) {
    return process.env.META_REDIRECT_URI.trim();
  }
  if (platform === "X" && process.env.X_REDIRECT_URI?.trim()) return process.env.X_REDIRECT_URI.trim();
  if (platform === "YOUTUBE") {
    const explicit = process.env.GOOGLE_REDIRECT_URI?.trim() || process.env.YOUTUBE_REDIRECT_URI?.trim();
    if (explicit) return explicit;
  }
  return `${publicBaseUrl()}${CALLBACK_PATH}`;
}

export function oauthCallbackCatalog() {
  if (isUploadPostPrimary()) {
    return [{ id: "upload-post", label: "Upload-Post webhook", url: `${publicBaseUrl()}/api/webhooks/upload-post` }] as const;
  }
  return [
    { id: "tiktok", label: "TikTok callback", url: oauthCallbackUrl("TIKTOK") },
    { id: "meta", label: "Meta callback", url: oauthCallbackUrl("INSTAGRAM") },
    { id: "x", label: "X callback", url: oauthCallbackUrl("X") },
    { id: "google", label: "Google / YouTube callback", url: oauthCallbackUrl("YOUTUBE") },
    { id: "generic", label: "Twitch / Kick / Bilibili callback", url: oauthCallbackUrl() },
  ] as const;
}

export function isPublicHttpsUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !isLocalhostHost(url.hostname) && !isUnusablePublicHostname(url.hostname);
  } catch {
    return false;
  }
}

export function mediaUrlIsSafeForExternalApis(value: string) {
  if (!value) return false;
  if (value.startsWith("file:")) return false;
  return isPublicHttpsUrl(value);
}

export function productionRequiresHttps() {
  return process.env.NODE_ENV === "production";
}
