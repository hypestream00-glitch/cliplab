# Operações

## Worker

`npm run worker`. Sem Redis em produção o preflight falha. Heartbeat Redis `cliplab:worker:heartbeat`.

Reinício: jobs persistidos em `ProcessingJob` / `RenderJob` / publicações agendadas devem ser reenfileirados pelo recovery existente. Não reprocesse projetos READY (incluindo fixtures reais).

## Redis

`REDIS_URL` Upstash `rediss://`. Sem fallback em memória em produção. Ver `docs/REDIS.md`.

## Filas

BullMQ. Retry com backoff. Jobs mortos devem aparecer como `FAILED` recuperável na UI, sem duplicar cobrança, clips ou chamadas OpenAI.

## Falhas comuns

| Sintoma | Ação |
|---|---|
| Upload CORS | Origin do `APP_URL` no bucket R2; nunca `*` |
| Worker parado | Um processo `npm run worker`; conferir heartbeat |
| Stripe TEST no ar | Esperado até decisão LIVE |
| OpenAI 429 | Backoff já existe; não reprocessar o mesmo projeto |

Não rode Next build, suíte completa, E2E e FFmpeg pesado ao mesmo tempo (OOM já ocorreu).
