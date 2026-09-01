const modules = {
  recovery: 0,
  health: 0,
  heartbeat: 0,
  enqueue: 0,
  "email-outbox": 0,
  "queue:social": 0,
  "queue:processing": 0,
} as const;

export type RedisUsageModule = keyof typeof modules;

const counts: Record<RedisUsageModule, number> = { ...modules };

export function recordRedisUsage(module: RedisUsageModule, operations = 1) {
  counts[module] += Math.max(0, operations);
}

export function redisUsageSnapshot() {
  return { ...counts };
}

export function resetRedisUsageForTests() {
  for (const key of Object.keys(counts) as RedisUsageModule[]) counts[key] = 0;
}

export function redisUsageDiagnosticText() {
  const snap = redisUsageSnapshot();
  return [
    "REDIS USAGE DIAGNOSTIC:",
    `queue:processing = ${snap["queue:processing"]} operations`,
    `queue:social = ${snap["queue:social"]} operations`,
    `email-outbox = ${snap["email-outbox"]} operations`,
    `recovery = ${snap.recovery} operations`,
    `health = ${snap.health} operations`,
    `heartbeat = ${snap.heartbeat} operations`,
  ].join("\n");
}
