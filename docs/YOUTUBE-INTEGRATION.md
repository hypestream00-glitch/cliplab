# Integração YouTube — CLIPLAB

Fontes oficiais consultadas em 29/08/2026:

- [Google OAuth 2.0 for Web Server Applications](https://developers.google.com/identity/protocols/oauth2/web-server)
- [YouTube Data API — Authentication](https://developers.google.com/youtube/v3/guides/authentication)
- [channels.list](https://developers.google.com/youtube/v3/docs/channels/list)
- [videos.insert](https://developers.google.com/youtube/v3/docs/videos/insert)
- [Resumable upload protocol](https://developers.google.com/youtube/v3/guides/using_resumable_upload_protocol)
- [thumbnails.set](https://developers.google.com/youtube/v3/docs/thumbnails/set)
- [Quota calculator](https://developers.google.com/youtube/v3/determine_quota_cost)
- [YouTube Analytics API](https://developers.google.com/youtube/analytics)
- [OAuth verification](https://support.google.com/cloud/answer/9110914)

CLIPLAB usa **somente** Google OAuth + YouTube Data API v3. Não há scraping, senha, cookie, API privada nem automação de browser. **Não existe API separada de Shorts** — o mesmo `videos.insert` publica vídeos verticais; a prateleira Shorts é decisão do YouTube.

## 1. Google Cloud project

1. [Google Cloud Console](https://console.cloud.google.com/) → criar projeto.
2. APIs & Services → Enable:
   - **YouTube Data API v3** (obrigatória)
   - **YouTube Analytics API** (somente se for pedir `yt-analytics.readonly`)
3. OAuth consent screen:
   - External (ou Internal em Workspace)
   - App name, support email, logo
   - Scopes mínimos (abaixo)
   - Test users enquanto o app estiver em Testing
4. Credentials → **OAuth client ID** → Web application
   - Authorized redirect URI: exatamente `https://seu-dominio.com/api/social/oauth/callback` (ou `GOOGLE_REDIRECT_URI`)
5. Copie Client ID e Client Secret. Nunca `NEXT_PUBLIC_*`.

Pode reutilizar `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` do login CLIPLAB. Não duplique credenciais sem necessidade.

## 2. Redirect URI

Cadastre **exatamente** (HTTPS em produção, absoluto, sem query/fragment):

```
https://seu-dominio.com/api/social/oauth/callback
```

Local: `http://localhost:3000/api/social/oauth/callback` precisa estar na lista do client.

## 3. Scopes

CLIPLAB pede por padrão:

| Scope | Motivo |
| --- | --- |
| `https://www.googleapis.com/auth/youtube.upload` | `videos.insert` + thumbnail |
| `https://www.googleapis.com/auth/youtube.readonly` | Canal (`mine=true`) + `videos.list` status/estatísticas |

Opcional, só se `YOUTUBE_ANALYTICS_SCOPE=true`:

| Scope | Motivo |
| --- | --- |
| `https://www.googleapis.com/auth/yt-analytics.readonly` | Watch time e relatórios Analytics |

Não solicitar `youtube.force-ssl` nem scopes de conteúdo irrelevante.

OAuth: `access_type=offline`, `prompt=consent` para obter refresh token. PKCE S256 também é enviado (recomendado).

## 4. Test users e verification

- Em **Testing**, só test users autenticam.
- Upload para contas fora dos testers exige **OAuth verification** / possível **restricted scope** review (`youtube.upload`).
- CLIPLAB **não** contorna a review. Sem aprovação, a API recusa; a UI mostra o erro.

Diagnóstico:

| Item | Valores |
| --- | --- |
| YouTube OAuth | `CONFIGURED` / `NOT CONFIGURED` |
| YouTube Upload | `AVAILABLE` se `YOUTUBE_UPLOAD_APPROVED=true`, senão `PERMISSION REQUIRED` |
| YouTube Analytics | `AVAILABLE` se `YOUTUBE_ANALYTICS_APPROVED=true`, senão `PERMISSION REQUIRED` |

O flag de upload **não** inventa um vídeo publicado. É um indicador operacional após você confirmar que o app passou no teste/review.

## 5. Canal

Após o callback: `GET /youtube/v3/channels?part=snippet,statistics,contentDetails&mine=true`.

Persistido em `SocialAccount`:

- `externalAccountId` = channelId
- `displayName` / `username` (handle/`customUrl` quando existir)
- `avatarUrl` (thumbnail)
- scopes, tokens criptografados, `expiresAt`
- `providerMeta`: `{ channelId, handle, customUrl }`

Sem canal: erro `youtubeSignupRequired`. Contas DEMO (`mock: true`) **não** são conexão real.

## 6. Variáveis de ambiente

```
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=https://seu-dominio.com/api/social/oauth/callback
YOUTUBE_UPLOAD_APPROVED=
YOUTUBE_ANALYTICS_APPROVED=
YOUTUBE_ANALYTICS_SCOPE=
```

Fallbacks: `YOUTUBE_CLIENT_ID` / `YOUTUBE_CLIENT_SECRET` / `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET`.

## 7. Upload

Resumable oficial:

1. `POST https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status`
2. Header `Location` = URI de upload
3. `PUT` em chunks de **8 MiB** (múltiplos de 256 KiB, último pode ser menor), stream do disco
4. `308` + `Range` para retomar; `bytes */SIZE` para consultar offset
5. Resposta 200/201 com `id` = videoId

Campos: title (100), description (5000), privacy `public|unlisted|private`, tags (até 30).

Thumbnail: `thumbnails/set` com a thumbnail do CLIPLAB. **Falha no thumbnail não falha a publicação.**

Status: `videos.list part=status,processingDetails`. CLIPLAB só marca `PUBLISHED` quando `uploadStatus=processed` e o processamento não falhou.

Jobs na fila `social-publishing` (`publish-youtube` no worker). HTTP da UI não espera o upload. Retry para quota/5xx/timeout/upload interrompido. Idempotência: lock `youtube:{targetId}:{clipId}:{accountId}` + videoId.

## 8. Shorts

Não há endpoint Shorts. Vídeos verticais usam o mesmo upload. A UI pode indicar “formato vertical / candidato a Short”; **não promete** classificação Shorts.

## 9. Quota

`videos.insert` custa da ordem de **1600 unidades**. A cota padrão é 10.000/dia.

CLIPLAB:

- sincroniza analytics a cada 15 min, lotes pequenos
- não consulta a API no page load das métricas
- trata `quotaExceeded` / `rateLimitExceeded` como recuperável (backoff)
- **não** contorna a cota

## 10. Analytics

Sem o scope Analytics, CLIPLAB usa só YouTube Data API:

- Canal: `subscriberCount`, `viewCount`, `videoCount`
- Vídeo: `viewCount`, `likeCount`, `commentCount`

Watch time e relatórios avançados = **N/A** até Analytics API + scope + `YOUTUBE_ANALYTICS_APPROVED`. Nunca números inventados.

## 11. Produção

- Redirect HTTPS igual ao consent screen
- Verification / restricted scopes antes de usuários externos
- Refresh token: se Google não devolver um novo, CLIPLAB mantém o anterior
- Disconnect chama `https://oauth2.googleapis.com/revoke`
- Audit: `YOUTUBE_CONNECTED`, `YOUTUBE_DISCONNECTED`, `YOUTUBE_UPLOAD_STARTED`, `YOUTUBE_PUBLISHED`, `YOUTUBE_PUBLISH_FAILED` — sem tokens
