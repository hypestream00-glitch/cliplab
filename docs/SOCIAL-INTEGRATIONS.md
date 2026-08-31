# Social integrations

Interface `SocialProvider`: authorization URL, callback, refresh, profile, publish, metrics, disconnect.

`PlatformCapabilities` controla a UI.

OAuth: authorization code, state, PKCE quando suportado, CSRF. Tokens criptografados. Nunca senha da rede. Nunca token no frontend ou localStorage.

Em desenvolvimento o callback mock redireciona internamente e marca `mock: true`. Publicações mock nunca são descritas como reais.

## Oficiais nesta fase

- **TikTok** — Login Kit + Content Posting. Ver `docs/TIKTOK-INTEGRATION.md`.
- **Instagram + Facebook** — Facebook Login + Graph API v26.0. Ver `docs/META-INTEGRATION.md`. Sem `META_APP_ID`/`META_APP_SECRET` a UI mostra Configuração necessária; CLIPLAB não finge OAuth.
- **X (Twitter)** — OAuth 2.0 + PKCE + Media Upload v2 + Tweets. Ver `docs/X-INTEGRATION.md`. Sem `X_CLIENT_ID`/`X_CLIENT_SECRET` a UI mostra Configuração necessária. Publicação exige tier Basic/Pro/Enterprise (nunca fingida no Free).
- **YouTube** — Google OAuth 2.0 + YouTube Data API v3 (resumable `videos.insert`). Ver `docs/YOUTUBE-INTEGRATION.md`. Reutiliza `GOOGLE_*` / `AUTH_GOOGLE_*`. Não há API separada de Shorts.
