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
  console.log(`REDIS_URL PRESENT: ${runtimeEnvPresent("REDIS_URL")}`);
  console.log(`DATABASE_URL PRESENT: ${runtimeEnvPresent("DATABASE_URL")}`);
}
