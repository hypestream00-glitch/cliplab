# Segurança

- Auth.js + cookies httpOnly (`secure` em produção)
- Troca de senha exige senha atual, grava `passwordChangedAt` e apaga sessões Auth.js (`prisma.session`)
- Checagem de workspace no servidor (inclui championships)
- API keys hashed (SHA-256), secret exibido uma vez
- Tokens sociais criptografados (AES-256-GCM)
- Sem log de tokens/senhas
- Webhooks Stripe com idempotência
- Webhooks Upload-Post: HMAC; em produção o secret é obrigatório
- Upload validado; storage keys aleatórias; signed URLs com TTL
- Rate limit (Redis quando disponível) e Zod nas rotas públicas
- Guard SSRF para URLs de ingestão (localhost/privadas/metadata)
- Path traversal: object keys resolvidas com `path.relative` dentro de `storage/`
