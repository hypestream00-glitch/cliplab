# Setup externo — checklist CortaClip

Callbacks para copiar: `/studio/settings/status` (não procure no código).

Não cole secrets no frontend. Tudo vai no `.env` / painel do servidor.

## Configuração social recomendada

1. Criar conta em [upload-post.com](https://www.upload-post.com/)
2. Copiar a API key no dashboard
3. Configurar `UPLOAD_POST_API_KEY` no servidor (nunca `NEXT_PUBLIC_*`)
4. Reiniciar a aplicação
5. Abrir `/studio/accounts`
6. Clicar **Conectar redes sociais**

Só isso. O usuário final autoriza TikTok, Instagram, Facebook, X, YouTube e as demais redes suportadas pelo Upload-Post, sem Developer Apps.

Webhook em produção: `{AUTH_URL}/api/webhooks/upload-post` **exige** `UPLOAD_POST_WEBHOOK_SECRET`.  
Documentação: [docs/UPLOAD-POST-INTEGRATION.md](./UPLOAD-POST-INTEGRATION.md)

## OPENAI

1. [platform.openai.com](https://platform.openai.com) → API keys
2. Habilitar modelos Whisper + chat (gpt-4o-mini ou o que definir em `OPENAI_MODEL`)
3. Callback: nenhum
4. Scopes: n/a
5. Env: `OPENAI_API_KEY`, `OPENAI_MODEL`
6. Review: não
7. Testar: System Status → Testar conexão → OpenAI (não roda no CI)

## SOCIAL (Upload-Post — padrão)

Ver **Configuração social recomendada** no topo deste arquivo. Providers nativos ficam na seção OPTIONAL abaixo.

## OPTIONAL — NATIVE PROVIDERS

Use somente se `SOCIAL_PROVIDER=native`.

### TIKTOK

1. [developers.tiktok.com](https://developers.tiktok.com)
2. Login Kit + Content Posting API
3. Callback: o URL TikTok em System Status (`/api/social/oauth/callback`)
4. Scopes: `user.info.basic`, `user.info.profile`, `user.info.stats`, `video.list`, `video.publish`
5. Env: `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET`, `TIKTOK_CONTENT_POSTING_APPROVED` após audit
6. Review: sim — Content Posting
7. Testar: Contas → conectar TikTok. Publicar só com confirmação “Publicar de verdade”

### META

1. [developers.facebook.com](https://developers.facebook.com)
2. Facebook Login, permissões de Page + Instagram profissional, webhooks se usar insights
3. Callback: URL Meta em System Status
4. Scopes: `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`, `instagram_basic`, `instagram_content_publish`, `instagram_manage_insights`
5. Env: `META_APP_ID`, `META_APP_SECRET`, `MEDIA_BASE_URL` HTTPS, flags `META_*_APPROVED`
6. Review: App Review + Business Verification
7. Testar: Contas → Instagram/Facebook. Mídia precisa ser HTTPS público

### X

1. [developer.x.com](https://developer.x.com)
2. OAuth 2.0, write + media
3. Callback: URL X em System Status
4. Scopes: `tweet.read`, `tweet.write`, `users.read`, `offline.access`, `media.write`
5. Env: `X_CLIENT_ID`, `X_CLIENT_SECRET`, `X_API_TIER` (basic/pro/enterprise), `X_WRITE_ACCESS_APPROVED`
6. Review / paid tier: Free não publica
7. Testar: Contas → X. Confirmação explícita para post real

### GOOGLE / YOUTUBE

1. Google Cloud Console → credenciais OAuth
2. YouTube Data API v3 (Analytics API se quiser métricas)
3. Callback: URL Google em System Status
4. Scopes: `youtube.upload`, `youtube.readonly`, opcional `yt-analytics.readonly`
5. Env: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `YOUTUBE_UPLOAD_APPROVED`, `YOUTUBE_ANALYTICS_*`
6. Review: verificação OAuth se sair de modo teste
7. Testar: Contas → YouTube → upload com confirmação

## STRIPE

1. [dashboard.stripe.com](https://dashboard.stripe.com)
2. Checkout, Customer Portal, webhook
3. Webhook: `{AUTH_URL}/api/stripe/webhook`
4. Eventos: `checkout.session.completed` (e os que o portal emitir)
5. Env: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_*`
6. Review: conta Stripe
7. Testar: Billing com chaves de teste. Sem pagamento fake no código

## REDIS

1. Qualquer Redis 7 (Compose, Upstash, host)
2. Persistência AOF/RDB conforme o host
3. Callback: n/a
4. n/a
5. Env: `REDIS_URL`
6. n/a
7. Testar: System Status → Redis / Testar conexão

## STORAGE

1. S3, R2, B2 ou outro S3-compatible
2. Bucket privado + chaves
3. n/a
4. n/a
5. Env: `STORAGE_PROVIDER`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_ENDPOINT`, `S3_REGION`
6. n/a
7. Testar: System Status → Storage

Bucket **privado**. Upload direto do browser exige CORS no R2 (PUT/HEAD, origin = `http://localhost:3000` no dev e `APP_URL` em produção). Não tornar o bucket público. Ver `docs/UPLOAD.md`. `MAX_VIDEO_UPLOAD_BYTES` é teto opcional (bytes).

## SMTP

1. Qualquer SMTP transacional
2. Autenticação + remetente
3. n/a
4. n/a
5. Env: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`
6. n/a
7. Testar: fluxo de reset de senha (quando SMTP estiver ligado)
