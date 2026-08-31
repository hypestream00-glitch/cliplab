# Storage

`STORAGE_PROVIDER=local|s3|r2|b2`. Produção: object storage S3-compatible (Cloudflare R2 via `S3_*`). Disco local só em desenvolvimento.

Chaves: `ws/{workspaceId}/{kind}/{projectId}/...` e uploads diretos `ws/{workspaceId}/uploads/{uploadId}/...` (legado `uploads/{workspaceId}/...` ainda é lido). Isolamento por prefixo de workspace; `/api/media` autoriza sessão + ownership.

- GET assinado: player ~900s, download ~120s. Não expõe credenciais.
- PUT assinado: `/studio/create` inicia sessão (`POST /api/uploads/init`), o browser envia o arquivo **direto ao R2**, depois `POST /api/uploads/:id` confirma com HEAD. Persistimos a **key**, nunca a URL temporária. TTL do PUT: 20 minutos.
- Com `STORAGE_PROVIDER=local`, o PUT streaming em `/api/uploads/:id/put` é fallback de desenvolvimento (não carrega o arquivo inteiro em Buffer).
- Dual-read: se o objeto não estiver no R2 e existir no disco local, o player serve o arquivo local (projetos antigos).
- Bucket permanece privado. Range/206 via `createReadStreamRange` (S3 GetObject Range) — o stream S3 não carrega o objeto inteiro em RAM.
- Worker: `createReadStream` → arquivo temp → FFprobe/FFmpeg; cleanup em `withJobTempDir`.
- Retenção: temporários de job são apagados no sucesso/falha. Uploads órfãos expirados sem `projectId` podem ser limpos. Source/clips do usuário não têm TTL automático.

Detalhes e CORS: `docs/UPLOAD.md`.

