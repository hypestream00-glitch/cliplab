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

- Liveness: `GET /health` or `GET /api/health` — process is up. No OpenAI/Stripe/social.
- Readiness: `GET /ready` or `GET /api/ready` — database + Redis PING + storage config.

Railway health checks must use **liveness**, not readiness. A 503 from `/ready` (missing Redis, storage, or DB) must not kill the web process.

## Railway (same repo, two services later)

| Service | Image target | Start | Public domain |
|---|---|---|---|
| `cliplab` (web) | default `web` | `npm run start` → `node scripts/start-web.mjs` | yes |
| `cliplab-worker` (future) | `--target worker` or same image + `npm run worker` | `npm run worker` | no |

Shared env: `DATABASE_URL`, `REDIS_URL`, R2, OpenAI, and the rest. Do not embed BullMQ in the web process (`CLIPLAB_EMBED_WORKERS=false`).

Listen: `HOSTNAME=0.0.0.0`, `PORT` from Railway (fallback `3000`). Prefer Railway target port `${PORT}`, not a hardcoded 3000, if the dashboard is changed later.

Do not copy `.env` / `.env.local` into the image. Production does not load dotenv/dotenvx from disk.

Migrations: `npx prisma migrate deploy` only with versioned migrations. Never `prisma db push` or `migrate reset` in production. This repo may still need a first versioned baseline — see `docs/DATABASE.md`.

Upload de vídeo em produção: browser → signed PUT no R2 → worker. Ver `docs/UPLOAD.md`. CORS do bucket R2 é configuração externa.

## Docker

Default image (last stage, `web`): Next.js standalone via `node scripts/start-web.mjs`.

- Binds `0.0.0.0`
- Listens on `PORT` (Railway injects this) or `3000`
- Does **not** start BullMQ. Production web: `CLIPLAB_EMBED_WORKERS=false`

Worker image: `docker build --target worker`. Command: `npm run worker` (`tsx workers/index.ts`). No public domain.

Do not copy `.env.local` into the image. Runtime secrets come from the host.

## Backup / restore

Ver `docs/DATABASE.md`.
