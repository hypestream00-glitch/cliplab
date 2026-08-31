# Upload direto (browser → R2)

Arquitetura de produção:

```
Browser
  ↓
CLIPLAB API — POST /api/uploads/init
  (auth, workspace, plano, tamanho, MIME, object key, signed PUT)
  ↓
Signed PUT URL (TTL 20 min, uma key, um método)
  ↓
Browser → Cloudflare R2 (bucket privado cliplab-media)
  ↓
CLIPLAB API — POST /api/uploads/:id  (complete)
  ↓
HEAD no objeto (existe, size, Content-Type quando houver)
  ↓
Project + ProcessingJob (idempotente)
  ↓
BullMQ `video-import`
  ↓
Redis Upstash
  ↓
Independent worker
  ↓
Stream R2 → temp → FFprobe → áudio → transcrição → análise → clips
  ↓
Artefatos persistidos no R2 (source, thumbs, audio, clips, renders)
```

O Next.js **não** recebe o arquivo grande. Não há `arrayBuffer` / Buffer do vídeo no Server Action.

Persistir **storageKey**, nunca a signed URL.

## Estados da UploadSession

`PENDING` → `UPLOADING` (PUT local) → `VALIDATING` (HEAD) → `UPLOADED` → `COMPLETED` (projectId)

Falhas: `FAILED`. Cancelamento/TTL: `EXPIRED`.

Mapeamento com o projeto: `COMPLETED` cria Project `QUEUED` e o worker avança `PROBING` / `TRANSCRIBING` / `ANALYZING` / `CLIPPING` / `READY`.

Não duplicar essa máquina no Project.

## Cancelamento

PUT único (não multipart). Cancelar no browser aborta o XHR, marca a sessão `EXPIRED` e tenta apagar o objeto se ainda não houver projeto. Não há resume de partes. Retry = novo init ou o mesmo signed URL enquanto o TTL valer.

## Multipart

PUT simples cobre o teto atual (`MAX_VIDEO_UPLOAD_BYTES` ∩ limite do plano, até 10 GB no Pro). Multipart S3 fica como extensão futura se o teto ultrapassar um PUT único confiável.

## Artefatos

Persistentes no R2 (privados, signed GET):

- vídeo de origem (`storageKey` do SourceVideo)
- thumbnail
- áudio extraído (reuso de transcrição)
- clips e renders
- zips/export

Temporários (apagados):

- diretórios `cliplab-job-*` no worker (`withJobTempDir`)
- uploads órfãos `PENDING`/`FAILED`/`EXPIRED` sem `projectId` após TTL

Nunca apagar mídia ligada a um Project válido (inclui RENATO GARCIA).

## CORS no R2 (ação externa)

O bucket permanece **privado**. Não usar `AllowedOrigins: ["*"]`.

Dev atual:

```json
[
  {
    "AllowedOrigins": ["http://localhost:3000"],
    "AllowedMethods": ["PUT", "GET", "HEAD"],
    "AllowedHeaders": ["Content-Type"],
    "ExposeHeaders": ["ETag", "Content-Length"],
    "MaxAgeSeconds": 3600
  }
]
```

Produção: acrescentar somente `https://DOMINIO-REAL-DO-CLIPLAB` (valor de `APP_URL`). Staging, se existir, vira uma origin HTTPS própria — nunca `*`.
