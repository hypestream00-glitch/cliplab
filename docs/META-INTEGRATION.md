# Integração Meta — Instagram + Facebook (CLIPLAB)

Fontes oficiais consultadas em 29/08/2026:

- [Facebook Login for Business / Graph API OAuth](https://developers.facebook.com/docs/facebook-login)
- [Access Tokens](https://developers.facebook.com/docs/facebook-login/guides/access-tokens)
- [Long-lived tokens](https://developers.facebook.com/docs/facebook-login/guides/access-tokens/get-long-lived)
- [Graph API](https://developers.facebook.com/docs/graph-api)
- [Pages API (`/me/accounts`)](https://developers.facebook.com/docs/pages-api)
- [Instagram Platform — Content Publishing](https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/content-publishing)
- [Instagram Reels publishing](https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user/media)
- [Facebook Reels Publishing API](https://developers.facebook.com/docs/video-api/guides/reels-publishing)
- [Instagram Insights](https://developers.facebook.com/docs/instagram-api/reference/ig-media/insights)
- [Webhooks](https://developers.facebook.com/docs/graph-api/webhooks)
- [App Review](https://developers.facebook.com/docs/resp-plat-initiatives/app-review)
- [Business Verification](https://www.facebook.com/business/help)

CLIPLAB usa **somente** estas APIs oficiais (Graph API **v26.0**). Não há scraping, senha, cookie, session token manual nem automação de browser.

## Decisão de fluxo

Um único **Facebook Login** (server-side authorization code + `client_secret`) cobre:

- Páginas do Facebook administradas (`/me/accounts`)
- Contas Instagram profissionais **vinculadas a uma Page** (`instagram_business_account`)

PKCE **não** faz parte deste fluxo confidencial. State criptográfico, cookie httpOnly, registro de uso único em `SocialOAuthState` (10 min).

Instagram Login (`graph.instagram.com` / `instagram_business_*`) **não** é usado nesta fase: exigiria um segundo OAuth e não descobriria Pages.

Conta Instagram pessoal (não profissional) **não publica**. A UI diz isso explicitamente se `/me/accounts` não retornar `instagram_business_account`.

## 1. Criar o app

1. Acesse [Meta for Developers](https://developers.facebook.com/) → **Create App**.
2. Tipo: **Business**.
3. Copie **App ID** e **App Secret** (nunca `NEXT_PUBLIC_*`).

## 2. Produtos necessários

- **Facebook Login** (OAuth)
- **Instagram Graph API** / Instagram API with Facebook Login
- **Webhooks** (opcional nesta fase; útil para App Review: deauthorize + data deletion)

Não ative produtos que o CLIPLAB não usa.

## 3. Redirect URI

Cadastre **exatamente** (HTTPS, absoluto, sem query/fragment):

```
https://seu-dominio.com/api/social/oauth/callback
```

Produção não aceita `http://localhost`. Para desenvolvimento use um túnel HTTPS e o mesmo valor em `META_REDIRECT_URI`.

## 4. Permissions (scopes)

CLIPLAB pede somente:

| Permissão | Motivo | Funcionalidade | App Review |
| --- | --- | --- | --- |
| `pages_show_list` | Listar Pages do usuário | Descoberta / seleção | Sim (uso avançado) |
| `pages_read_engagement` | Ler Page e tokens | Validar Page, fan_count | Sim |
| `pages_manage_posts` | Publicar na Page | Facebook Reels | Sim |
| `instagram_basic` | Ler perfil IG profissional | Avatar, username, tipo | Sim |
| `instagram_content_publish` | Container + publish Reels | Instagram Reels | Sim |
| `instagram_manage_insights` | Insights de mídia IG | Métricas de conteúdo | Sim |

Não solicitar `pages_manage_metadata`, `ads_*`, mensagens, etc.

## 5. Requisitos Instagram

- Conta **Professional** (Business ou Creator)
- Vinculada a uma **Facebook Page** que o usuário administra
- O app deve ter Instagram Graph API
- `instagram_content_publish` aprovado para publicar fora de testers do app
- Vídeo: MOV/MP4, 3s–15 min, máx. 300 MB, 23–60 fps, largura ≤ 1920 px, **URL HTTPS pública** (a Meta baixa o arquivo; localhost **não** funciona)

Fluxo oficial:

1. `POST /{ig-user-id}/media` `media_type=REELS` + `video_url`
2. Poll `GET /{container-id}?fields=status_code` → `IN_PROGRESS` / `FINISHED` / `ERROR` / `EXPIRED`
3. `POST /{ig-user-id}/media_publish` `creation_id=`
4. Container expira em 24h. Polling com backoff, timeout ~12 min, sem loop infinito.

## 6. Requisitos Facebook Page

- Usuário com papel que inclui `CREATE_CONTENT` ou `MANAGE` na Page
- `pages_manage_posts` aprovado para publicar fora de testers
- Reels via **Reels Publishing API**:
  1. `POST /{page-id}/video_reels` `upload_phase=start`
  2. Upload binário em `https://rupload.facebook.com/video-upload/{version}/{video-id}` (funciona localmente; não exige URL pública)
  3. `upload_phase=finish` `video_state=PUBLISHED`
  4. Poll `GET /{video-id}?fields=status`
- Specs: 3–90s, mín. 540×960, 24–60 fps. Reels de Page são **públicos**.

CLIPLAB **não** conecta automaticamente todas as Pages. O usuário escolhe em `/studio/accounts/meta`.

## 7. App Review

Sem aprovação, testers do app podem conectar e (no modo desenvolvimento) publicar nas próprias contas. Produção para o público exige App Review das permissões acima.

Diagnóstico (sem secrets):

- `META_INSTAGRAM_PUBLISH_APPROVED=true` → Instagram Publishing **AVAILABLE**
- `META_FACEBOOK_PUBLISH_APPROVED=true` → Facebook Publishing **AVAILABLE**
- Sem essas flags, com App ID/Secret: **APP REVIEW REQUIRED**
- Sem App ID/Secret: **CONFIGURATION REQUIRED**

O código de publicação existe em desenvolvimento; a UI **não** marca publishing como AVAILABLE até as flags.

## 8. Business Verification

Algumas permissões e limites de produção exigem **Business Verification** no Business Manager. CLIPLAB não contorna isso. Sem verificação, testers ainda podem desenvolver; publicação pública permanece bloqueada pelo próprio App Review da Meta.

## 9. Variáveis de ambiente (somente server-side)

```
META_APP_ID=
META_APP_SECRET=
META_REDIRECT_URI=https://seu-dominio.com/api/social/oauth/callback
META_GRAPH_VERSION=v26.0
META_MEDIA_BASE_URL=https://seu-dominio-publico
META_INSTAGRAM_PUBLISH_APPROVED=
META_FACEBOOK_PUBLISH_APPROVED=
META_INSIGHTS_APPROVED=
META_WEBHOOK_VERIFY_TOKEN=
ENCRYPTION_KEY=
AUTH_URL=
```

- Nunca `NEXT_PUBLIC_META_APP_SECRET`.
- `META_MEDIA_BASE_URL` deve ser HTTPS **não-localhost**. A Meta precisa baixar o vídeo do Instagram.
- Sem `META_APP_ID` / `META_APP_SECRET` a UI mostra **Instagram — Configuração necessária** e **Facebook — Configuração necessária**. Nenhuma conta fake é criada.

## 10. Desenvolvimento vs produção

| | Desenvolvimento | Produção |
| --- | --- | --- |
| Testers do app | Podem OAuth e testar APIs | — |
| Redirect | Túnel HTTPS | Domínio real |
| Instagram `video_url` | Túnel HTTPS em `META_MEDIA_BASE_URL` | CDN/domínio público |
| Facebook rupload | Local OK | Local ou storage |
| App Review flags | Vazias → APP REVIEW REQUIRED | `true` após aprovação |
| Seeds `mock: true` | Continuam **DEMO** | Não são conexão real |

## 11. Como testar OAuth

1. Preencha `META_APP_ID`, `META_APP_SECRET`, `META_REDIRECT_URI`.
2. Cadastre o redirect no app Meta e adicione seu usuário como tester.
3. `/studio/accounts` → **Conectar Instagram** ou **Conectar Facebook**.
4. Autorize no diálogo oficial.
5. Escolha Pages / contas IG. Tokens ficam só no servidor (AES-256-GCM).
6. State inválido/reusado/expirado → erro, sem token.

## 12. Como habilitar publishing

1. App Review de `instagram_content_publish` e/ou `pages_manage_posts`.
2. `META_INSTAGRAM_PUBLISH_APPROVED=true` e/ou `META_FACEBOOK_PUBLISH_APPROVED=true`.
3. Instagram: `META_MEDIA_BASE_URL` HTTPS público.
4. Worker `social-publishing` processa `publish-instagram` / `publish-facebook` (mesmo job, ramificado por plataforma). Não bloqueia o request web.

## 13. Como habilitar Insights

1. App Review de `instagram_manage_insights` (+ leitura de Page).
2. `META_INSIGHTS_APPROVED=true`.
3. Worker `analytics-sync` a cada 15 min. A UI lê **snapshots**, não a Graph API a cada page load.

Métricas **confirmadas** nesta versão:

- IG conta: `followers_count`, `media_count`
- IG mídia: `views`, `reach`, `likes`, `comments`, `saved`, `shares` (quando a API devolver)
- FB Page: `followers_count` / `fan_count` (views de conta = **N/A**)
- FB vídeo: `views`, `likes.summary`, `comments.summary`

`plays` / `impressions` de IG estão deprecated. Se a API não devolver o campo → **N/A**. Nunca inventar número.

## Tokens

- Short-lived user token → long-lived (`grant_type=fb_exchange_token`, ~60 dias)
- Page token derivado de `/me/accounts` após o long-lived: **não expira sozinho**; invalida se o usuário revogar ou perder o papel
- CLIPLAB guarda Page token em `accessTokenEncrypted` e user token em `refreshTokenEncrypted`
- Refresh: renovar user token e re-derivar Page token. Não há endpoint de refresh de Page token.
- `REAUTH_REQUIRED` se o user token expirar ou a Graph API retornar 190

## Webhooks

Implementados (assinatura HMAC, idempotentes):

- `GET/POST /api/social/meta/webhook` — verificação `hub.verify_token` + `X-Hub-Signature-256`
- `POST /api/social/meta/deauthorize`
- `POST /api/social/meta/data-deletion`

Úteis para App Review. **Não** substituem o polling de container/Reels.

## Desconexão

Confirmação na UI. Se for a última conta IG/FB do workspace, `DELETE /me/permissions` no token de usuário. Senão, só remove o registro local (revogar o grant mataria as outras Pages). AuditLog `META_DISCONNECTED`.

## Jobs

Fila existente `social-publishing`:

- Instagram → processamento container (status PROCESSING)
- Facebook → rupload + poll

Fila `analytics-sync`: TikTok + Instagram + Facebook.
