export const QUEUE_RETRY = {
  attempts: 3,
  backoff: { type: "exponential" as const, delay: 4000 },
};
