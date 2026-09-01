# Upload-Post — integração CortaClip

Fonte de verdade: [docs.upload-post.com](https://docs.upload-post.com/) e [upload-post.com](https://www.upload-post.com/).

CLIPLAB usa Upload-Post como **provedor social padrão**. O dono do produto não cria TikTok/Meta/X/Google Developer Apps para publicação básica. Cada workspace CLIPLAB tem um perfil Upload-Post; o usuário final autoriza as próprias redes na experiência white-label.

## 1. Criar conta

1. Cadastre-se em [upload-post.com](https://www.upload-post.com/).
2. Abra o dashboard e copie a **API key**.
3. Coloque no servidor: `UPLOAD_POST_API_KEY=` (nunca `NEXT_PUBLIC_*`, nunca frontend, nunca logs).

## 2. Plano mínimo

O plano precisa permitir:

- User profiles (white-label)
- Publicação (`POST /api/upload`)
- JWT de conexão (`POST /api/uploadposts/users/generate-jwt`)

Limites de perfil vêm de `GET /api/uploadposts/users` (`limit`, `plan`). Confira [pricing](https://www.upload-post.com/pricing). Se a API devolver `error_code: PROFILE_LIMIT_REACHED`, o CLIPLAB mostra: **Limite de perfis sociais atingido no plano atual.**

## 3. White-label

O CLIPLAB chama `POST /api/uploadposts/users/generate-jwt` com:

- `username` do perfil do workspace (gerado no servidor; o client nunca escolhe)
- `redirect_url` = `{AUTH_URL}/studio/accounts?connected=1`
- `language` = `pt`
- título/descrição CLIPLAB
- `show_calendar` = `false` (o calendário fica no CLIPLAB)

A API devolve `access_url` (JWT ~48h). O usuário autoriza as redes e volta para `{AUTH_URL}/studio/accounts?connected=1`. O Upload-Post também pode acrescentar `connect_status=success`. CLIPLAB sincroniza as contas e mostra: **Redes sociais atualizadas.**

Diagnóstico barato: `GET /api/uploadposts/me` (valida a API key; não cria post). A UI só mostra CONNECTED / INVALID_KEY / PLAN_LIMITATION / API_ERROR — nunca e-mail nem a key.

## 4. User profiles

- Criar: `POST /api/uploadposts/users` `{ username }`
- Listar: `GET /api/uploadposts/users`
- Um perfil: `GET /api/uploadposts/users/{username}`
- Apagar: `DELETE /api/uploadposts/users` `{ username }`

Username CLIPLAB: `cliplab_{workspaceId}`. Criação é automática e idempotente (409 = já existe).

## 5. JWT connect

Auth das chamadas de API: `Authorization: Apikey YOUR_API_KEY`.

O JWT **não** é a API key. É um token de perfil, gerado no backend, de curta duração (48h na documentação atual).

Não há endpoint REST oficial de unlink por rede. A desconexão real acontece na página white-label; o CLIPLAB remove a conta local de forma idempotente (se o profile já não listar a rede, trata como já desconectada) e ignora-a no próximo sync até reconectar.

## 6. Publishing

`POST https://api.upload-post.com/api/upload` (multipart)

Campos usados: `user`, `platform[]`, `video` (arquivo MP4 **ou** URL HTTPS pública — nunca localhost), `title`, `async_upload=true`, `external_id`, `Idempotency-Key`, opcionalmente `scheduled_date` + `timezone`.

Plataformas de vídeo na documentação atual: tiktok, instagram, linkedin, youtube, facebook, twitter (X), threads, pinterest, bluesky, reddit, e outras.

Uma publicação CLIPLAB com várias contas vira **um** request com vários `platform[]`.

## 7. Scheduling

Preferimos o agendamento do Upload-Post (`scheduled_date`). CLIPLAB **não** dispara o worker nativo para `provider=UPLOAD_POST`.

- Listar: `GET /api/uploadposts/schedule`
- Cancelar: `DELETE /api/uploadposts/schedule/{job_id}`
- Editar: `PATCH /api/uploadposts/schedule/{job_id}`

Cópia local em `SocialPublication` / calendário.

## 8. Analytics

`GET /api/analytics/{username}?platforms=instagram,tiktok,...`

Métricas normalizadas para `SocialMetricSnapshot` / `SocialPostMetricSnapshot`. Se o campo não vier, a UI mostra **N/A**.

## 9. Redes suportadas (conexão)

Conforme Connect API / JWT atuais: TikTok, Instagram, Facebook, LinkedIn, YouTube, X, Threads, Reddit, Pinterest (e outras que o plano/página hospedada exibir). Bluesky entra na publicação quando a conta estiver conectada.

## 10. Quotas

A API aplica caps diários por conta social e limites de perfil por plano. 429 = cap/quota. CLIPLAB não inventa números de plano.

## 11. Env

```
SOCIAL_PROVIDER=upload-post
UPLOAD_POST_API_KEY=
UPLOAD_POST_API_BASE=   # opcional
UPLOAD_POST_WEBHOOK_SECRET=  # opcional
```

## 12. Webhooks

Documentados com HMAC-SHA256:

- `X-Upload-Post-Signature` (`sha256=` + HMAC de `{timestamp}.{rawBody}`)
- `X-Upload-Post-Timestamp`
- `X-Upload-Post-Event`
- `X-Upload-Post-Delivery`

Endpoint CLIPLAB: `POST /api/webhooks/upload-post`

Eventos: `upload_completed`, `social_account_connected`, `social_account_disconnected`, `social_account_reauth_required`.

Cadastre a URL em `POST /api/uploadposts/users/notifications` ou webhook por perfil. Sem secret configurado, o CLIPLAB ainda aceita o POST em desenvolvimento, mas produção deve usar `UPLOAD_POST_WEBHOOK_SECRET`. Sem webhook, o worker faz polling em `GET /api/uploadposts/status`.

## 13. Produção

- HTTPS em `AUTH_URL`
- API key só no backend
- Redirect `/studio/accounts`
- Não enviar URL de mídia `localhost` ao Upload-Post; o CLIPLAB sobe o arquivo MP4 local quando possível
- Providers nativos (TikTok/Meta/X/YouTube OAuth) ficam em `SOCIAL_PROVIDER=native`

## 14. Fallback nativo

`SOCIAL_PROVIDER=native` reativa TikTokProvider, InstagramProvider, FacebookProvider, XProvider, YouTubeProvider. Não apague esse código (`LegacyNativeSocialProviders` via `getSocialProvider` / `getLegacyNativeSocialProvider`).
