# Database

PostgreSQL + Prisma 7 (`prisma-client` generator + `@prisma/adapter-pg`).

## DATABASE_URL

Formato: `postgresql://USER:PASSWORD@HOST:5432/DB?sslmode=require` (ssl em produção).

Desenvolvimento local: `npm run dev:db` (embedded) ou `docker compose up postgres`.

## Schema / deploy

Índices em workspaceId, userId, createdAt, status, platform, projectId, clipId, socialAccountId+capturedAt, scheduledFor+status.

Créditos: `CreditBatch` FIFO + `CreditTransaction` com `reference` e `idempotencyKey` únicos. Saldo em `CreditBalance` deve bater com o ledger.

Desenvolvimento atual: `npx prisma db push` (não destrói dados se não passar `--force-reset`).

Produção: `npx prisma migrate deploy`. Se ainda não houver pasta `prisma/migrations`, gere o baseline a partir do schema atual **sem** `migrate reset`.

## Backup

```
pg_dump "$DATABASE_URL" -Fc -f cliplab.dump
```

## Restore

```
pg_restore -d "$DATABASE_URL" --clean --if-exists cliplab.dump
```

Nunca rode restore em produção sem confirmação. Nunca `prisma migrate reset` em dados reais.

