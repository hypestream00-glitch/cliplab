# Produção — CLIPLAB

Ainda **não** fazer deploy a partir desta pasta sem o checklist abaixo. Detalhe de status: `docs/PRODUCTION-READINESS.md`. Setup externo: `docs/EXTERNAL-SETUP.md`.

## Checklist (objetivo)

- [ ] Domínio e HTTPS
- [ ] `APP_URL` / `AUTH_URL` HTTPS (nunca localhost)
- [ ] CORS do R2 com origin de produção (`https://DOMINIO-REAL`, nunca `*`)
- [ ] PostgreSQL gerenciado + backup
- [ ] Processo **web** (`npm start`) e processo **worker** (`npm run worker`)
- [ ] Redis TLS (`REDIS_URL=rediss://…`)
- [ ] R2 bucket **privado** + signed PUT/GET
- [ ] Decisão Stripe TEST → LIVE (hoje permanece TEST)
- [ ] Webhook Stripe LIVE apontando para `/api/stripe/webhook`
- [ ] Webhook Upload-Post + secret
- [ ] SMTP de produção
- [ ] `OPENAI_API_KEY` de produção
- [ ] Monitoramento (logs estruturados / Sentry opcional)
- [ ] Backups do banco
- [ ] Termos e Privacidade revisados por um advogado

## Processos

```
web:    npm start
worker: npm run worker
```

`CLIPLAB_EMBED_WORKERS=false`. `WORKER_CONCURRENCY=1` até haver headroom.

## Preflight

`npm run preflight` não imprime secrets. Falhas de domínio/deploy são **EXTERNAL ACTION**, não bug de código.
