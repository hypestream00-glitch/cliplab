export async function register() {
  if (process.env.NEXT_RUNTIME === "edge") return;
  const { essentialEnvErrors, validateProcessEnv } = await import("./lib/env/schema");
  const { logger } = await import("./lib/logger");
  const { ensureDevWorkers } = await import("./lib/queue/boot");
  ensureDevWorkers();
  const essential = essentialEnvErrors();
  if (essential.length) {
    logger.error({ keys: essential.map((issue) => issue.key) }, "essential env missing");
  }
  const parsed = validateProcessEnv();
  if (!parsed.ok) {
    const optional = parsed.issues.filter((issue) => !issue.essential).map((issue) => issue.key);
    if (optional.length) logger.warn({ keys: optional }, "optional env invalid or empty after parse");
  }
}
