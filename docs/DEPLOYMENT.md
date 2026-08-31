# Deploy CLIPLAB

Dois processos:

1. **web** — `npm run start` (Next.js)
2. **worker** — `npm run worker` (BullMQ: import, render, publish, analytics, download)

Desenvolvimento pode embutir workers (`CLIPLAB_EMBED_WORKERS` ou não-production). Produção: Redis + worker separado.

## Dependências

| Peça | Função |
|---|---|
| PostgreSQL | `DATABASE_URL` |
| Redis | `REDIS_URL` — obrigatório em produção para **todas** as filas |
| Object storage | `STORAGE_PROVIDER=s3|r2|b2` + `S3_*` (S3-compatible) |
| FFmpeg + ffprobe | no PATH da máquina/imagem |
| HTTPS + domínio | `AUTH_URL` e `MEDIA_BASE_URL` públicos |

Docker Compose local (`docker-compose.yml`) sobe Postgres e Redis. Serviços `web`/`worker` estão documentados em comentário (mesma imagem, comandos diferentes). Não é obrigatório para desenvolver (há `npm run dev:db`).

## Variáveis

Copie `.env.example`. Nunca commite `.env`. Gere `AUTH_SECRET` e `ENCRYPTION_KEY` no painel do host (não reutilize as chaves de desenvolvimento).

## Migrations

Este repositório usa `prisma db push` no desenvolvimento. Em produção:

```
npx prisma generate
npx prisma migrate deploy
```

Se ainda não houver baseline, crie a primeira migration a partir do schema (sem `migrate reset`) — ver `docs/DATABASE.md`.

## Health

- Liveness: `GET /api/health`
- Readiness: `GET /api/ready` (banco + Redis PING + config de storage; sem upload)

Upload de vídeo em produção: browser → signed PUT no R2 → worker. Ver `docs/UPLOAD.md`. CORS do bucket R2 é configuração externa.

## Docker

`Dockerfile` multi-stage inclui FFmpeg no runner web (`node server.js` standalone).

Worker: target `worker` (`npx tsx workers/index.ts`) com o mesmo env.

## Backup / restore

Ver `docs/DATABASE.md`.
