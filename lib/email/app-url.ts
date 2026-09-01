import { isLocalhostHost, isPublicHttpsUrl } from "@/lib/env/app-url";
import { normalizeRawToken } from "@/lib/email/token-encoding";

function fallbackOrigin() {
  return "http://localhost:3000";
}

export function appOrigin() {
  const raw = (process.env.APP_URL ?? process.env.AUTH_URL ?? fallbackOrigin()).trim().replace(/\/$/, "");
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") return fallbackOrigin();
    if (url.username || url.password) return fallbackOrigin();
    return url.origin;
  } catch {
    return fallbackOrigin();
  }
}

export function appPathUrl(path: string) {
  const safe = path.startsWith("/") && !path.startsWith("//") ? path : "/";
  return `${appOrigin()}${safe}`;
}

export function isSafeAppPath(path: string) {
  return path.startsWith("/") && !path.startsWith("//") && !path.includes("\\");
}

export function isForbiddenPublicVerifyHost(hostname: string) {
  const host = hostname.toLowerCase();
  if (isLocalhostHost(host)) return true;
  if (host === "railway.app" || host.endsWith(".railway.app")) return true;
  if (host.includes("cliplab")) return true;
  return false;
}

export function isForbiddenPublicVerifyUrl(value: string) {
  try {
    return isForbiddenPublicVerifyHost(new URL(value).hostname);
  } catch {
    return true;
  }
}

/** Keep a stored link only when it is public HTTPS and not a retired host. */
export function isUsablePublicActionUrl(value: string) {
  return isPublicHttpsUrl(value) && !isForbiddenPublicVerifyUrl(value);
}

export function verificationEmailUrl(rawToken: string) {
  const token = encodeURIComponent(normalizeRawToken(rawToken) || rawToken.trim());
  return appPathUrl(`/verify-email?token=${token}`);
}

export function passwordResetEmailUrl(rawToken: string) {
  const token = encodeURIComponent(normalizeRawToken(rawToken) || rawToken.trim());
  return appPathUrl(`/reset-password?token=${token}`);
}
