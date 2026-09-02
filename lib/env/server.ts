export type EnvLookupKind = "exact" | "trimmed" | "normalized" | "none";

const ZERO_WIDTH = /[\u200B-\u200D\uFEFF\u00A0]/g;

function normalizeEnvKey(key: string) {
  return key.replace(/^\uFEFF/, "").replace(ZERO_WIDTH, "").trim().normalize("NFKC").toUpperCase();
}

function asTrimmedString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

/** Live Node env bag. Avoid static `process.env.NAME` so Next/Turbopack cannot inline build-time empties. */
export function liveProcessEnvBag(): Record<string, string | undefined> {
  try {
    const bag = new Function("return process.env")() as NodeJS.ProcessEnv | undefined;
    return bag ?? {};
  } catch {
    const proc = Reflect.get(globalThis, "process") as NodeJS.Process | undefined;
    const env = proc ? (Reflect.get(proc, "env") as NodeJS.ProcessEnv | undefined) : undefined;
    return env ?? {};
  }
}

export function lookupEnvInBag(bag: Record<string, string | undefined>, name: string) {
  const wanted = name.trim();
  if (!wanted) return { value: "", kind: "none" as const, keyFound: false };
  const direct = bag[wanted];
  if (typeof direct === "string") {
    const trimmed = direct.trim();
    return { value: trimmed, kind: "exact" as const, keyFound: true };
  }
  const normalizedWanted = normalizeEnvKey(wanted);
  let trimmedMatch = "";
  let normalizedMatch = "";
  let keyFound = false;
  for (const key of Object.keys(bag)) {
    if (key.trim() === wanted) {
      keyFound = true;
      const value = asTrimmedString(bag[key]);
      if (value) {
        trimmedMatch = value;
        break;
      }
    }
    if (!normalizedMatch && normalizeEnvKey(key) === normalizedWanted) {
      keyFound = true;
      const value = asTrimmedString(bag[key]);
      if (value) normalizedMatch = value;
    }
  }
  if (trimmedMatch) return { value: trimmedMatch, kind: "trimmed" as const, keyFound: true };
  if (normalizedMatch) return { value: normalizedMatch, kind: "normalized" as const, keyFound: true };
  return { value: "", kind: "none" as const, keyFound };
}

/**
 * Read a server env var at call time. Never snapshots `process.env`.
 */
export function getServerEnv(name: string): string {
  return lookupEnvInBag(liveProcessEnvBag(), name).value;
}

export function hasServerEnv(name: string) {
  return getServerEnv(name).length > 0;
}

export function firstServerEnv(names: readonly string[]) {
  for (const name of names) {
    const value = getServerEnv(name);
    if (value) return value;
  }
  return "";
}

export function inspectServerEnv(name: string) {
  const processLookup = lookupEnvInBag(liveProcessEnvBag(), name);
  return {
    present: processLookup.value.length > 0,
    keyFound: processLookup.keyFound,
    empty: processLookup.keyFound && processLookup.value.length === 0,
    lookup: processLookup.kind,
  };
}

const GOOGLE_CLIENT_ID_KEYS = ["GOOGLE_CLIENT_ID", "YOUTUBE_CLIENT_ID", "AUTH_GOOGLE_ID"] as const;
const GOOGLE_CLIENT_SECRET_KEYS = ["GOOGLE_CLIENT_SECRET", "YOUTUBE_CLIENT_SECRET", "AUTH_GOOGLE_SECRET"] as const;

export function googleOAuthClientId() {
  return firstServerEnv(GOOGLE_CLIENT_ID_KEYS);
}

export function googleOAuthClientSecret() {
  return firstServerEnv(GOOGLE_CLIENT_SECRET_KEYS);
}

export function isGoogleOAuthConfigured() {
  return Boolean(googleOAuthClientId() && googleOAuthClientSecret());
}

export function googleOAuthEnvReport() {
  const canonicalId = inspectServerEnv("GOOGLE_CLIENT_ID");
  const canonicalSecret = inspectServerEnv("GOOGLE_CLIENT_SECRET");
  const googleClientIdPresent = canonicalId.present;
  const googleClientSecretPresent = canonicalSecret.present;
  const googleOAuthConfigured = isGoogleOAuthConfigured();
  return {
    runtime: "node" as const,
    nodeEnv: process.env.NODE_ENV === "production" ? "production" : process.env.NODE_ENV === "test" ? "test" : "development",
    googleClientIdPresent,
    googleClientSecretPresent,
    googleOAuthConfigured,
    canonicalClientIdPresent: googleClientIdPresent,
    canonicalClientSecretPresent: googleClientSecretPresent,
    legacyClientIdPresent: hasServerEnv("YOUTUBE_CLIENT_ID") || hasServerEnv("AUTH_GOOGLE_ID"),
    legacyClientSecretPresent: hasServerEnv("YOUTUBE_CLIENT_SECRET") || hasServerEnv("AUTH_GOOGLE_SECRET"),
    clientIdKeyFound: canonicalId.keyFound,
    clientIdValueEmpty: canonicalId.empty,
    clientIdLookup: canonicalId.lookup,
  };
}

export function logGoogleOAuthEnvPresence() {
  const report = googleOAuthEnvReport();
  process.stdout.write(`GOOGLE_CLIENT_ID_PRESENT=${report.googleClientIdPresent}\n`);
  process.stdout.write(`GOOGLE_CLIENT_SECRET_PRESENT=${report.googleClientSecretPresent}\n`);
}

export const googleOAuthIdFromProcessEnv = googleOAuthClientId;
export const googleOAuthSecretFromProcessEnv = googleOAuthClientSecret;
export const googleClientIdPresent = () => hasServerEnv("GOOGLE_CLIENT_ID");
export const googleClientSecretPresent = () => hasServerEnv("GOOGLE_CLIENT_SECRET");
export const googleOAuthEnvPresence = () => ({
  googleClientIdPresent: hasServerEnv("GOOGLE_CLIENT_ID"),
  googleClientSecretPresent: hasServerEnv("GOOGLE_CLIENT_SECRET"),
});
export const readLiveEnv = getServerEnv;
