export function livenessBody() {
  return { ok: true as const, service: "cliplab" };
}

export function readinessBody(params: {
  database: "ok" | "error";
  queue: "redis" | "local" | "unavailable";
  essential: string[];
  redis?: "ok" | "error" | "unset";
  storage?: "ok" | "error" | "local";
}) {
  const redisOk = params.redis !== "error";
  const storageOk = params.storage !== "error";
  const ready =
    params.essential.length === 0 && params.database === "ok" && params.queue !== "unavailable" && redisOk && storageOk;
  return {
    ready,
    database: params.database,
    queue: params.queue,
    redis: params.redis ?? (params.queue === "redis" ? "ok" : params.queue === "unavailable" ? "error" : "unset"),
    storage: params.storage ?? "ok",
    essential: params.essential,
  };
}
