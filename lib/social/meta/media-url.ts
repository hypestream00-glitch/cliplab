import { createHmac, timingSafeEqual } from "node:crypto";
import { publicBaseUrl, isPublicHttpsUrl } from "@/lib/env/app-url";
import { getStorage } from "@/lib/storage";

function mediaBaseUrl() {
  return (process.env.META_MEDIA_BASE_URL ?? publicBaseUrl()).replace(/\/$/, "");
}

export function isMetaReachableBase(base = mediaBaseUrl()) {
  return isPublicHttpsUrl(base);
}

function signingKey() {
  const raw = process.env.ENCRYPTION_KEY ?? process.env.META_APP_SECRET ?? "";
  if (!raw) throw new Error("ENCRYPTION_KEY is not set");
  return raw;
}

export function signMetaMedia(key: string, expiresAt: number) {
  return createHmac("sha256", signingKey()).update(`${key}.${expiresAt}`).digest("hex");
}

export function verifyMetaMedia(key: string, expiresAt: number, signature: string) {
  if (!Number.isFinite(expiresAt) || expiresAt * 1000 < Date.now()) return false;
  const expected = Buffer.from(signMetaMedia(key, expiresAt));
  const given = Buffer.from(signature);
  if (expected.length !== given.length) return false;
  return timingSafeEqual(expected, given);
}

export async function createMetaFetchableVideoUrl(storageKey: string) {
  const base = mediaBaseUrl();
  if (!isMetaReachableBase(base)) return null;
  const exists = await getStorage().exists(storageKey);
  if (!exists) return null;
  const expiresAt = Math.floor(Date.now() / 1000) + 60 * 60;
  const sig = signMetaMedia(storageKey, expiresAt);
  const url = new URL("/api/media/meta", `${base}/`);
  url.searchParams.set("key", storageKey);
  url.searchParams.set("exp", String(expiresAt));
  url.searchParams.set("sig", sig);
  return url.toString();
}
