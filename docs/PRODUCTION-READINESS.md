# Production readiness — CortaClip

Classificação: READY | NEEDS_ENV | NEEDS_EXTERNAL_ACCOUNT | NEEDS_APPROVAL | NEEDS_DEPLOYMENT | OPTIONAL | BLOCKED.

| Dependência | Estado | Notas |
|---|---|---|
| ENV centralizada (`lib/env/schema.ts`) | READY | Opcionais não impedem boot. Só `DATABASE_URL` é essencial. |
| `.env.example` | READY | Sem secrets. |
| AUTH_SECRET / ENCRYPTION_KEY local | READY | `scripts/ensure-local-secrets.mjs` gera no `.env` gitignored. Produção: chave separada no deploy. |
| Database / Prisma schema | READY | Sem reset automático. `db push` no dev; ver `docs/DATABASE.md`. |
| PostgreSQL produção | NEEDS_DEPLOYMENT | Compatível via `DATABASE_URL`. |
| Redis / fila | NEEDS_ENV | Sem `REDIS_URL` em produção: **todas** as filas = ERROR (sem memória). Dev = LOCAL FALLBACK. |
| Worker | NEEDS_DEPLOYMENT | `npm run worker` separado. Preflight Redis/DB/storage/FFmpeg. SIGTERM fecha filas. |
| Job recovery | READY | Reenfileira jobs persistidos + agenda. |
| Storage local | READY | Dev. |
| Object storage S3-compatible | NEEDS_ENV | Adapter real; status honesto se chaves faltarem. |
| Direct browser → R2 upload | READY | Signed PUT + UploadSession. CORS local `http://localhost:3000` configurado no bucket privado. Produção: acrescentar `APP_URL` HTTPS (nunca `*`). |
| Media Base URL | NEEDS_ENV | HTTPS público. Nunca localhost/file:// para APIs externas. |
| FFmpeg | NEEDS_DEPLOYMENT | PATH + limites de timeout/concurrency/duração. |
| OpenAI | NEEDS_EXTERNAL_ACCOUNT | Sem key = MOCK. Com key = REAL. Probe só no botão admin. |
| OAuth callbacks | READY | Helper único `oauthCallbackUrl`. |
| TikTok | NEEDS_EXTERNAL_ACCOUNT + NEEDS_APPROVAL | Credentials + Content Posting audit. |
| Meta (IG/FB) | NEEDS_EXTERNAL_ACCOUNT + NEEDS_APPROVAL | App Review + Business Verification + mídia HTTPS. |
| X | NEEDS_EXTERNAL_ACCOUNT + NEEDS_APPROVAL | Tier Free não publica. |
| YouTube | NEEDS_EXTERNAL_ACCOUNT + NEEDS_APPROVAL | Data API + verificação OAuth. |
| Publishing / scheduling / analytics | READY | Código pronto; execução depende de contas reais. |
| Stripe | NEEDS_EXTERNAL_ACCOUNT | Sem keys = CONFIGURATION REQUIRED. Sem pagamento fake. |
| Stripe webhook idempotency | READY | `ProcessedStripeEvent` + ledger `stripe:{eventId}`. |
| Créditos / ledger | READY | `CreditTransaction` + `idempotencyKey`. Análise: `project:{id}:analysis`. |
| Webhooks (Stripe/Meta/Upload-Post) | READY | Assinatura rejeitada se inválida. Produção exige `UPLOAD_POST_WEBHOOK_SECRET`. |
| Rate limiting | READY | Redis INCR quando `REDIS_URL`; senão memória (testes/dev). |
| Security headers / cookies / CORS | READY | Produção Secure/HttpOnly/SameSite=Lax + HSTS. Sem CORS `*`. |
| Upload / FFmpeg args | READY | MIME/ext/tamanho/magic/ffprobe. spawn argv, sem shell. |
| Health / ready | READY | `/api/health` liveness. `/api/ready` pings DB + Redis + config de storage. |
| System Status | READY | `/studio/settings/status` diagnóstico real + callbacks. |
| Logging / request ID | READY | Redaction. Stack no server; usuário vê mensagem + digest. |
| Observability paga | OPTIONAL | `SENTRY_DSN`. Structured logs sem vendor. |
| SMTP | OPTIONAL | CONFIGURATION REQUIRED se vazio. |
| Docker | READY | Imagem com FFmpeg. Compose Postgres+Redis; web/worker comentados (mesma imagem, comandos diferentes). |
| Preflight | READY | `npm run preflight`. |
| Exportação de dados / exclusão de conta | BLOCKED | Workspace delete existe. Exclusão completa de conta (user + R2 + Stripe) **não** é produto; a UI não finge que apagou. |
| 2FA / ingest URL | BLOCKED | Ingest por URL recusado; guard SSRF pronto se for habilitado. |

Produção com Redis ausente: **não** usa memória do processo web para nenhuma fila.

## Escala (sem overengineering)

**~1.000 usuários:** web e worker separados, Redis/BullMQ, R2, quotas por plano (`maxConcurrentGeneration` / exports), rate limit Redis, índices `(workspaceId, status)`. Upload grande: browser → signed PUT → R2 (o Next não bufferiza o arquivo).

**~10.000 usuários (caminho futuro, não comprado):** autoscaling de workers, pool Postgres, plano Redis, lifecycle R2, CDN na frente de signed GET, limites OpenAI/Upload-Post, multipart S3 se o teto ultrapassar um PUT único confiável.

Ver também `docs/WORKER.md`, `docs/STORAGE.md`, `docs/UPLOAD.md`, `docs/REDIS.md`, `docs/ENVIRONMENT.md`.
