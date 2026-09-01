# Integração TikTok (CortaClip)

Fontes oficiais consultadas em 29/08/2026:

- [Login Kit Web](https://developers.tiktok.com/doc/login-kit-web)
- [User Access Token Management](https://developers.tiktok.com/doc/oauth-user-access-token-management)
- [Scopes](https://developers.tiktok.com/doc/tiktok-api-scopes)
- [Get User Info](https://developers.tiktok.com/doc/tiktok-api-v2-get-user-info)
- [Content Posting — Direct Post](https://developers.tiktok.com/doc/content-posting-api-get-started)
- [Query Creator Info](https://developers.tiktok.com/doc/content-posting-api-reference-query-creator-info)
- [Get Post Status](https://developers.tiktok.com/doc/content-posting-api-reference-get-video-status)
- [Media Transfer](https://developers.tiktok.com/doc/content-posting-api-media-transfer-guide)
- [List Videos](https://developers.tiktok.com/doc/tiktok-api-v2-video-list)
- [Video Object](https://developers.tiktok.com/doc/tiktok-api-v2-video-object)

CLIPLAB usa **somente** estas APIs. Não há scraping, senha, cookie ou automação de browser.

## Como criar o app

1. Acesse [TikTok for Developers](https://developers.tiktok.com/) e crie um app.
2. Em **Products**, ative:
   - **Login Kit** (OAuth do criador)
   - **Content Posting API** com **Direct Post** (publicação no perfil)
3. Em Login Kit, cadastre o **Redirect URI** exato (HTTPS, absoluto, sem query/fragment, máx. 10 URIs). Exemplo:
   `https://seu-dominio.com/api/social/oauth/callback`
4. Copie **Client Key** e **Client Secret** (não é Client ID da Meta).

Produção não aceita `localhost` HTTP. Para desenvolvimento local use um túnel HTTPS e cadastre esse URI.

## Scopes solicitados

O CLIPLAB pede, em uma string separada por vírgulas:

| Scope | Uso |
| --- | --- |
| `user.info.basic` | open_id, avatar, display_name |
| `user.info.profile` | username |
| `user.info.stats` | follower_count, likes_count, video_count |
| `video.list` | view/like/comment/share dos vídeos públicos |
| `video.publish` | Direct Post + status |

O usuário pode recusar scopes toggleable. O app grava os scopes efetivamente concedidos. Sem `video.publish` a publicação falha com mensagem clara. Sem `user.info.stats` / `video.list`, a UI mostra **N/A** — nunca um número inventado.

## Variáveis de ambiente (somente server-side)

```
TIKTOK_CLIENT_KEY=
TIKTOK_CLIENT_SECRET=
TIKTOK_REDIRECT_URI=https://seu-dominio.com/api/social/oauth/callback
TIKTOK_CONTENT_POSTING_APPROVED=
ENCRYPTION_KEY=
AUTH_URL=
```

- `TIKTOK_CLIENT_KEY` é o **client_key** oficial. `TIKTOK_CLIENT_ID` é aceito só como fallback legado.
- `TIKTOK_REDIRECT_URI` deve ser **idêntico** ao cadastrado no portal e ao `redirect_uri` do authorize e do token.
- `TIKTOK_CONTENT_POSTING_APPROVED=true` só depois do audit. Sem isso o diagnóstico mostra `NEEDS_APPROVAL`.
- Nunca use `NEXT_PUBLIC_*` para estes valores.

## Fluxo OAuth (Web)

PKCE **não** faz parte do Login Kit Web oficial (`code_verifier` é exigido só em mobile/desktop). CLIPLAB segue o fluxo web:

1. `GET /api/social/oauth/start?platform=TIKTOK`
2. State criptograficamente aleatório, persistido na sessão (cookie httpOnly) **e** na tabela `SocialOAuthState` (expira em 10 min, uso único, amarrado a user+workspace).
3. Redirect para `https://www.tiktok.com/v2/auth/authorize/`
4. Callback em `/api/social/oauth/callback` com `code` + `state`
5. Validação de state (cookie + banco). State inválido/reusado/expirado é rejeitado.
6. `POST https://open.tiktokapis.com/v2/oauth/token/` (`grant_type=authorization_code`)
7. Perfil via `GET /v2/user/info/`
8. Tokens gravados com AES-256-GCM (`ENCRYPTION_KEY`). Access token **nunca** vai ao browser.

Refresh: `grant_type=refresh_token` no mesmo endpoint. Access token ~24h; refresh ~365 dias. Refresh rotativo: o novo `refresh_token` substitui o anterior. Falha definitiva → `REAUTH_REQUIRED` (não desconecta em silêncio).

Revoke: `POST https://open.tiktokapis.com/v2/oauth/revoke/` no disconnect.

## Publicação (Direct Post)

1. `POST /v2/post/publish/creator_info/query/` — opções de privacidade reais (`PUBLIC_TO_EVERYONE`, `MUTUAL_FOLLOW_FRIENDS`, `FOLLOWER_OF_CREATOR`, `SELF_ONLY`). Comentários/Duet/Stitch só aparecem se o criador permitir.
2. Validação local: arquivo, duração (máx. do creator), tamanho ≤ 4 GB, 360–4096 px, 23–60 fps, caption ≤ 2200.
3. `POST /v2/post/publish/video/init/` com `source=FILE_UPLOAD` (PULL_FROM_URL exigiria domínio verificado; CLIPLAB usa upload local em chunks).
4. `PUT` no `upload_url` com `Content-Range`, chunks 5–64 MB, sem carregar o MP4 inteiro na RAM.
5. Poll `POST /v2/post/publish/status/fetch/` (máx. ~30 req/min). Mapeamento:
   - `PROCESSING_UPLOAD` → `UPLOADING`
   - `PROCESSING_DOWNLOAD` → `PROCESSING`
   - `PUBLISH_COMPLETE` → `PUBLISHED`
   - `FAILED` → `FAILED`
6. `publicaly_available_post_id` só existe após moderação e se o post for público.

Apps **não auditados**: o conteúdo fica restrito a visualização privada. Não tente burlar o review. Após testes, submeta o app a audit para posts públicos.

## Métricas

Não existe endpoint oficial de “views da conta”. CLIPLAB persiste só o que a API devolve:

- Conta (`user.info.stats`): followers, likes totais, posts.
- Conteúdo (`video.list` / `video.query`): view_count, like_count, comment_count, share_count de vídeos **públicos**.
- Posts privados ou sem escopo: **N/A**.

Sincronização via fila `analytics-sync` (~15 min), não a cada page load. Rate limit 429 + Retry-After.

## Como testar

Sem credenciais: `/studio/accounts` mostra **Configuração necessária**. Connect abre o aviso. Nenhum OAuth fake.

Com credenciais e URI HTTPS cadastrado:

1. Contas → Conectar TikTok
2. Autorizar no TikTok
3. Voltar para `/studio/accounts` com avatar/username
4. Abrir clipe → Publicar → escolher privacidade devolvida pelo creator info
5. Acompanhar `/studio/publishing` (status atualiza sozinho enquanto PROCESSANDO)
6. Métricas em `/studio/metrics/accounts` e `/studio/metrics/content`

Não use keys inventadas.

## Limites atuais (API)

Ver `lib/social/platform-limits.ts`. Caption 2200. Vídeo até 4 GB / 10 min no init; o criador pode ter teto menor (`max_video_post_duration_sec`). Creator info: 20 req/min. Status: 30 req/min.
