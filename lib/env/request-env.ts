/**
 * Live process env for the current Node process.
 * Do not import `{ env }` from `node:process` and do not read Google client
 * credentials as a static `process.env` member — Next/Turbopack inlines that
 * to empty during `next build` (Docker has no secrets).
 */
function liveProcessEnv(): Record<string, string | undefined> {
  const proc = Reflect.get(globalThis, "process") as NodeJS.Process | undefined;
  if (!proc) return {};
  const env = Reflect.get(proc, "env") as NodeJS.ProcessEnv | undefined;
  return env ?? {};
}

/**
 * Request-time env read. Iterates live keys so the bundler cannot fold
 * Google OAuth client id/secret into a build-time empty constant.
 */
export function readLiveEnv(name: string): string {
  const wanted = name.trim();
  if (!wanted) return "";
  const env = liveProcessEnv();
  for (const key of Object.keys(env)) {
    if (key.trim() !== wanted) continue;
    const value = env[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

export function googleOAuthIdFromProcessEnv() {
  return readLiveEnv("GOOGLE_CLIENT_ID") || readLiveEnv("YOUTUBE_CLIENT_ID") || readLiveEnv("AUTH_GOOGLE_ID");
}

export function googleOAuthSecretFromProcessEnv() {
  return readLiveEnv("GOOGLE_CLIENT_SECRET") || readLiveEnv("YOUTUBE_CLIENT_SECRET") || readLiveEnv("AUTH_GOOGLE_SECRET");
}

export function googleClientIdPresent() {
  return readLiveEnv("GOOGLE_CLIENT_ID").length > 0;
}

export function googleClientSecretPresent() {
  return readLiveEnv("GOOGLE_CLIENT_SECRET").length > 0;
}

export function googleOAuthEnvPresence() {
  return {
    googleClientIdPresent: googleClientIdPresent(),
    googleClientSecretPresent: googleClientSecretPresent(),
  };
}

export function logGoogleOAuthEnvPresence() {
  const presence = googleOAuthEnvPresence();
  process.stdout.write(`GOOGLE_CLIENT_ID_PRESENT=${presence.googleClientIdPresent}\n`);
  process.stdout.write(`GOOGLE_CLIENT_SECRET_PRESENT=${presence.googleClientSecretPresent}\n`);
}
