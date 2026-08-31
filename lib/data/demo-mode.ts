export function isDemoDataEnabled(source: Record<string, string | undefined> = process.env) {
  const nodeEnv = (source.NODE_ENV ?? "").toLowerCase();
  if (nodeEnv === "production") return false;
  const value = source.ENABLE_DEMO_DATA?.trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes" || value === "on";
}

export function shouldRunSeed(argv: string[] = process.argv, source: Record<string, string | undefined> = process.env) {
  return source.CLIPLAB_RUN_SEED === "true" || argv.includes("--force");
}
