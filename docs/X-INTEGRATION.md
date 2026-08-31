# Integração X (Twitter) — CLIPLAB

Fontes oficiais consultadas em 29/08/2026:

- [OAuth 2.0 Authorization Code with PKCE](https://docs.x.com/resources/fundamentals/authentication/oauth-2-0/authorization-code)
- [OAuth 2.0 Making requests](https://docs.x.com/resources/fundamentals/authentication/oauth-2-0/overview)
- [Users lookup — GET /2/users/me](https://docs.x.com/x-api/users/get-me)
- [Media Upload](https://docs.x.com/x-api/media/introduction)
- [POST /2/tweets](https://docs.x.com/x-api/posts/create-post)
- [X API access / products](https://developer.x.com/en/docs/twitter-api/getting-started/about-twitter-api)

CLIPLAB usa **somente** a API oficial v2. Não há scraping, senha, cookie, token colado na UI nem automação de browser.

## 1. Criar o Developer App

1. Acesse [X Developer Portal](https://developer.x.com/en/portal/dashboard).
2. Crie um Project + App (User authentication).
3. User authentication settings:
   - App type: **Web App** (confidential client).
   - Callback URI: exatamente `https://seu-dominio.com/api/social/oauth/callback` (ou o valor de `X_REDIRECT_URI`).
   - Website URL obrigatória.
4. Copie **Client ID** e **Client Secret**. Nunca `NEXT_PUBLIC_*`.

## 2. OAuth 2.0 + PKCE

Authorize: `https://x.com/i/oauth2/authorize`

Token / refresh / revoke:

- `POST https://api.x.com/2/oauth2/token`
- `POST https://api.x.com/2/oauth2/revoke`

PKCE **é obrigatório** (`code_challenge` S256 + `code_verifier`). Cliente confidencial também envia `Authorization: Basic` (client_id:client_secret).

State: 24 bytes aleatórios, cookie httpOnly, registro de uso único em `SocialOAuthState` (10 min), vinculado à sessão.

Access token ~2 h. Refresh token **rotaciona** (`offline.access`). CLIPLAB persiste o novo refresh criptografado.

## 3. Scopes

CLIPLAB pede somente:

| Scope | Motivo |
| --- | --- |
| `tweet.read` | Ler posts / métricas públicas |
| `tweet.write` | Criar o post |
| `users.read` | Perfil (`/2/users/me`) |
| `offline.access` | Refresh token |
| `media.write` | Upload de vídeo |

## 4. API tier

A API do X **não** permite fingir publicação.

| Diagnóstico | Quando |
| --- | --- |
| `CONFIGURATION REQUIRED` | Sem `X_CLIENT_ID` / `X_CLIENT_SECRET` |
| `PLAN REQUIRED` | `X_API_TIER=free` |
| `API ACCESS REQUIRED` | Credenciais presentes, mas sem write confirmado |
| `AVAILABLE` | `X_API_TIER=basic\|pro\|enterprise` **ou** `X_WRITE_ACCESS_APPROVED=true` |

O Free tier típico **não escreve**. CLIPLAB recusa o job com `plan_restriction` / `api_access_required` em vez de marcar PUBLISHED.

## 5. Variáveis de ambiente

```
X_CLIENT_ID=
X_CLIENT_SECRET=
X_REDIRECT_URI=https://seu-dominio.com/api/social/oauth/callback
X_API_TIER=          # free | basic | pro | enterprise
X_WRITE_ACCESS_APPROVED=
X_LONG_POSTS=        # true somente se Premium long posts (25.000). Padrão 280.
```

## 6. Como testar OAuth (sem publicar)

1. Preencha Client ID/Secret e redirect URI idêntico no Portal.
2. `/studio/accounts` → Conectar X.
3. Autorize. CLIPLAB grava `SocialAccount` com tokens AES-256-GCM, `externalAccountId`, username, avatar, scopes, `expiresAt`.
4. Seeds DEMO (`mock: true`) **não** são conexão real.

## 7. Publicação

Fluxo oficial de **vídeo** (não é o endpoint de imagem):

1. `POST /2/media/upload` `command=INIT` (`media_category=tweet_video`)
2. `APPEND` em chunks de 4 MB lidos do disco (não carrega o arquivo inteiro na RAM)
3. `FINALIZE`
4. `STATUS` até `succeeded` (ou sem `processing_info` = pronto)
5. `POST /2/tweets` com `{ text, media: { media_ids } }`

Limites usados neste fluxo: **512 MB**, duração máx. **140 s**, texto **280** (ou 25.000 se `X_LONG_POSTS=true`).

Jobs na fila `social-publishing` (`publish-x` no worker). HTTP da UI não espera o upload. Retry só para 429/5xx/timeout. Idempotência: lock `x:{targetId}:{clipId}:{accountId}` + `externalPostId`.

## 8. Métricas

Disponíveis neste acesso (quando a API devolver):

- Conta: `public_metrics.followers_count`, `tweet_count`
- Post: `public_metrics` likes / replies / retweets
- Impressões / organic: só se o payload incluir `organic_metrics` ou `impression_count`

Indisponível = **N/A**. Nunca números inventados. Snapshots em `SocialMetricSnapshot` / `SocialPostMetricSnapshot`; a UI **não** chama a API a cada page load.

## 9. Limitações

- Sem write no tier: publicação recusada, não mockada.
- Rate limits: CLIPLAB honra 429 + `retry-after` / `x-rate-limit-*`.
- Revoke oficial no disconnect.
- Reauth (`REAUTH_REQUIRED`) se o refresh rotacionado falhar.
- Audit: `X_CONNECTED`, `X_DISCONNECTED`, `X_PUBLISH_STARTED`, `X_PUBLISHED`, `X_PUBLISH_FAILED` — sem tokens.
