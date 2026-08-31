# Worker

Processo separado: `npm run worker` (`workers/index.ts`).

- `CLIPLAB_EMBED_WORKERS=false` impede workers pesados no processo Next.js (dev e produção).
- Produção: Redis obrigatório. Sem `REDIS_URL` o worker falha no preflight e não aceita jobs.
- Preflight valida Redis PING, database, storage (S3/R2 em produção) e FFmpeg/ffprobe.
- SIGTERM/SIGINT: para de aceitar jobs (`Worker.close`), fecha filas e desconecta Redis.
- Heartbeat Redis `cliplab:worker:heartbeat` (TTL 60s) + arquivo local de fallback.
- `WORKER_CONCURRENCY` (padrão 1, máximo 8). FFmpeg tem slot próprio (`FFMPEG_MAX_CONCURRENCY`).

Web e worker compartilham a mesma codebase; comandos diferentes. Não rode dois workers no mesmo host sem necessidade.
