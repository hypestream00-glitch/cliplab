export function backoffWithJitter(attempt: number, baseMs = 1000, maxMs = 16_000) {
  const exp = Math.min(maxMs, baseMs * 2 ** Math.max(0, attempt));
  const jitter = Math.floor(Math.random() * Math.max(1, exp * 0.25));
  return Math.min(maxMs, exp + jitter);
}

export async function sleepMs(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}
