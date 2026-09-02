import { readLiveEnv } from "@/lib/env/request-env";

/**
 * Runtime env access that bundlers cannot replace with build-time constants.
 * Reads the live process env bag by key name on every call.
 */
export function runtimeEnv(name: string): string {
  return readLiveEnv(name);
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

export { logGoogleOAuthEnvPresence } from "@/lib/env/request-env";
