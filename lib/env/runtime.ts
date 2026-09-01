/** Runtime env access that bundlers cannot replace with build-time constants. */
export function runtimeEnv(name: string): string {
  const bag = process.env;
  const value = bag[name];
  return typeof value === "string" ? value.trim() : "";
}

export function runtimeEnvPresent(name: string): boolean {
  return runtimeEnv(name).length > 0;
}

export function logWorkerEnvPresence() {
  process.stdout.write(`REDIS_URL PRESENT: ${runtimeEnvPresent("REDIS_URL")}\n`);
  process.stdout.write(`DATABASE_URL PRESENT: ${runtimeEnvPresent("DATABASE_URL")}\n`);
  process.stdout.write(`APP_URL PRESENT: ${runtimeEnvPresent("APP_URL")}\n`);
  process.stdout.write(`AUTH_URL PRESENT: ${runtimeEnvPresent("AUTH_URL")}\n`);
}
