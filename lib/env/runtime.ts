import { env as nodeProcessEnv } from "node:process";

/**
 * Runtime env access that bundlers cannot replace with build-time constants.
 * Always index a live env bag with a function argument — never `process.env.NAME`.
 */
export function runtimeEnv(name: string): string {
  const bag = nodeProcessEnv;
  const value = bag[name];
  return typeof value === "string" ? value.trim() : "";
}

export function runtimeEnvPresent(name: string): boolean {
  return runtimeEnv(name).length > 0;
}

export function firstRuntimeEnv(names: readonly string[]): string {
  for (const name of names) {
    const value = runtimeEnv(name);
    if (value) return value;
  }
  return "";
}

export function logWorkerEnvPresence() {
  process.stdout.write(`REDIS_URL PRESENT: ${runtimeEnvPresent("REDIS_URL")}\n`);
  process.stdout.write(`DATABASE_URL PRESENT: ${runtimeEnvPresent("DATABASE_URL")}\n`);
  process.stdout.write(`APP_URL PRESENT: ${runtimeEnvPresent("APP_URL")}\n`);
  process.stdout.write(`AUTH_URL PRESENT: ${runtimeEnvPresent("AUTH_URL")}\n`);
}

/** Presence only. Never log client id or secret values. */
export function logGoogleOAuthEnvPresence() {
  const idPresent = runtimeEnvPresent("GOOGLE_CLIENT_ID");
  const secretPresent = runtimeEnvPresent("GOOGLE_CLIENT_SECRET");
  process.stdout.write(`GOOGLE_CLIENT_ID_PRESENT=${idPresent}\n`);
  process.stdout.write(`GOOGLE_CLIENT_SECRET_PRESENT=${secretPresent}\n`);
}
