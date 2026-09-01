# Arquitetura

CortaClip é um monólito Next.js com serviços desacoplados. Não recrie o app: preserve Auth.js, Prisma, R2, Redis/BullMQ, Stripe TEST, Upload-Post e o worker separado.

## Superfícies

- `app/(marketing)` landing, preços, termos, privacidade
- `app/(auth)` login, cadastro, verificação, reset
- `app/onboarding` primeiro acesso persistido (`onboardingCompleted`)
- `app/(studio)` produto autenticado
- `app/admin` super admin
- `app/api` Auth.js, uploads diretos, Stripe, Upload-Post, API v1

Domínios em `lib/`: auth, db, storage, queue, ffmpeg, ai, transcription, social, analytics, billing, security, uploads.

Workers em `workers/` consomem filas BullMQ. `CLIPLAB_EMBED_WORKERS=false` impede workers pesados no processo web.

Todo conteúdo pertence a um `Workspace`. Autorização é sempre server-side (nunca confiar só no ID do client).

## Fluxos

### Upload

Browser → `POST /api/uploads/init` → signed PUT no R2 (bucket privado) → `POST /api/uploads/:id` (HEAD/stat) → `createProject` → fila `video-import`.

O Next **não** bufferiza o arquivo inteiro quando `STORAGE_PROVIDER=r2`. Ver `docs/UPLOAD.md`.

### Processamento

Worker: probe → extração de áudio → transcrição → análise de clips → recortes FFmpeg → thumbnails. Estados persistidos em `Project.status` + `ProcessingJob`. Créditos/minutos usam duração **probed**, com idempotency key por projeto.

### Render

`enqueueRender` cria `RenderJob`. A request HTTP não espera o FFmpeg. Output vai para R2; a UI usa signed GET curta.

### Publicação

Composer valida workspace + contas conectadas. A chamada externa final só ocorre com confirmação explícita. Agendamento em UTC no banco; UI no timezone do usuário. Ver `docs/UPLOAD-POST-INTEGRATION.md`.
