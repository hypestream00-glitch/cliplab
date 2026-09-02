import { getServerEnv, hasServerEnv, logGoogleOAuthEnvPresence } from "@/lib/env/server";

export function runtimeEnv(name: string): string {
  return getServerEnv(name);
}

export function runtimeEnvPresent(name: string): boolean {
  return hasServerEnv(name);
}

export function firstRuntimeEnv(names: readonly string[]): string {
  for (const name of names) {
    const value = getServerEnv(name);
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

export { logGoogleOAuthEnvPresence };
