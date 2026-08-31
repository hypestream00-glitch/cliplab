# Redis

`REDIS_URL` (TLS: `rediss://`). Produção: dependência crítica. Sem URL, `queueMode() === "unavailable"` e **qualquer** `enqueue` lança `QueueUnavailableError` — sem fallback em memória.

Dev sem Redis: LOCAL FALLBACK in-process (marcado como mock).

BullMQ:

- `maxRetriesPerRequest: null` (exigência do Worker)
- conexão TLS quando a URL é `rediss://`
- retry/backoff exponencial (`lib/queue/retry.ts`, 3 tentativas, 4s)
- jobs identificados por `queue:entityId:jobId` (idempotência de enqueue)
- `removeOnFail: 500` — falhas definitivas permanecem inspecionáveis; não há loop infinito

Rate limit de API usa INCR no Redis quando configurado; senão memória do processo (testes/dev).

Não compartilhe um único ioredis entre Queue e Worker; cada um recebe options e o BullMQ abre conexões próprias. Heartbeat usa `getSharedRedis()`.
