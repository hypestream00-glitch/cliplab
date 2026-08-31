# Environment matrix

| | LOCAL DEV | STAGING | PRODUCTION |
|---|---|---|---|
| `NODE_ENV` | development | production | production |
| Database | Postgres local / `dev:db` | Postgres gerenciado | Postgres gerenciado |
| Redis | opcional (fallback memória) | `REDIS_URL` obrigatório | `REDIS_URL` obrigatório (`rediss://` se TLS) |
| Storage | `local` ok | R2/S3 | R2/S3; `local` = FAIL |
| Direct upload | local PUT stream ou R2 signed PUT | R2 signed PUT + CORS | R2 signed PUT + CORS no bucket |
| `MAX_VIDEO_UPLOAD_BYTES` | opcional | opcional | teto global ∩ limite do plano |
| Workers | `CLIPLAB_EMBED_WORKERS=false` + `npm run worker` recomendado | processo `worker` | processo `worker` separado |
| Stripe | TEST keys only | TEST | TEST até go-live explícito; LIVE bloqueado neste repo |
| `APP_URL` / `AUTH_URL` | `http://localhost:3000` | HTTPS staging | HTTPS público |
| SMTP | opcional | real de staging | real |
| OpenAI | key → real; sem key → MOCK explícito | key obrigatória | key obrigatória; sem mock silencioso |
| Social | Upload-Post test | Upload-Post | Upload-Post; OAuth callbacks no domínio público |
| Logs | debug | info | info; sem secrets |

Rotação de secrets: só via env. Não há secrets no código. Não rotacione automaticamente.
