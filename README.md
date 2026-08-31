# CLIPLAB

SaaS de clipping, edição, publicação e analytics de vídeos.

O nome do produto fica em `lib/config/brand.ts`.

## Setup local

```bash
npm install
cp .env.example .env
npm run dev:db
npx prisma generate
npx prisma db push
npm run db:seed
```

Gere um `AUTH_SECRET` e um `ENCRYPTION_KEY` reais antes de produção (`scripts/ensure-local-secrets.mjs` cobre o `.env` local).

Em outro terminal:

```bash
npm run worker
npm run dev
```

Abra [http://localhost:3000](http://localhost:3000). `CLIPLAB_EMBED_WORKERS=false`. `WORKER_CONCURRENCY=1`.

## Documentação

- `docs/ARCHITECTURE.md` — fluxos de upload, processamento, render e publicação
- `docs/UPLOAD.md` — browser → R2
- `docs/PRODUCTION.md` — checklist de deploy (não executar daqui)
- `docs/SECURITY.md` — secrets, cookies, isolamento
- `docs/OPERATIONS.md` — worker, Redis, recuperação de fila
- `docs/EXTERNAL-SETUP.md` — contas externas
- `docs/ENVIRONMENT.md` — variáveis

## Seed

Usuário demo:

- `demo@cliplab.app` / `demo123456`
- admin: `admin@cliplab.app` / `demo123456`

Não reprocesse o projeto **RENATO GARCIA** se ele existir no banco local: é fixture real (leitura apenas).

## Stripe

Permanece **TEST** até decisão explícita de LIVE. Sem cobrança real neste repositório de desenvolvimento.

## Qualidade

```bash
npm test
npm run lint
npm run typecheck
npm run build
npm run preflight
```

Execute esses passos em sequência. Não em paralelo.
