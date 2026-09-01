export type SetupGuide = {
  id: string;
  title: string;
  env: string[];
  steps: string[];
};

export const SETUP_GUIDES: SetupGuide[] = [
  {
    id: "openai",
    title: "OpenAI",
    env: ["OPENAI_API_KEY", "OPENAI_MODEL"],
    steps: ["Crie uma API key em platform.openai.com.", "Preencha OPENAI_API_KEY no servidor (.env / painel de deploy).", "Reinicie o app e use Testar conexão em System Status."],
  },
  {
    id: "upload-post",
    title: "Upload-Post",
    env: ["UPLOAD_POST_API_KEY", "SOCIAL_PROVIDER"],
    steps: [
      "Crie uma conta em upload-post.com.",
      "Copie a API key do dashboard.",
      "Defina UPLOAD_POST_API_KEY no servidor (nunca no frontend).",
      "Escolha um plano com white-label e publicação.",
      "Opcional: UPLOAD_POST_WEBHOOK_SECRET após cadastrar o webhook.",
    ],
  },
  {
    id: "tiktok",
    title: "TikTok",
    env: ["TIKTOK_CLIENT_KEY", "TIKTOK_CLIENT_SECRET", "TIKTOK_CONTENT_POSTING_APPROVED"],
    steps: ["Crie um app em developers.tiktok.com.", "Cadastre o callback copiado em System Status.", "Habilite Login Kit e Content Posting.", "Após o audit, defina TIKTOK_CONTENT_POSTING_APPROVED=true."],
  },
  {
    id: "meta",
    title: "Meta (Instagram / Facebook)",
    env: ["META_APP_ID", "META_APP_SECRET", "META_INSTAGRAM_PUBLISH_APPROVED", "META_FACEBOOK_PUBLISH_APPROVED", "MEDIA_BASE_URL"],
    steps: ["Crie um app em developers.facebook.com.", "Cadastre o callback Meta copiado em System Status.", "Use HTTPS público em MEDIA_BASE_URL (nunca localhost).", "App Review + Business Verification são obrigatórios para publicação pública."],
  },
  {
    id: "x",
    title: "X",
    env: ["X_CLIENT_ID", "X_CLIENT_SECRET", "X_API_TIER", "X_WRITE_ACCESS_APPROVED"],
    steps: ["Crie um app em developer.x.com.", "Cadastre o callback X copiado em System Status.", "O tier Free não publica. Use Basic/Pro/Enterprise.", "Marque X_WRITE_ACCESS_APPROVED=true só com write + media.write."],
  },
  {
    id: "youtube",
    title: "Google / YouTube",
    env: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "YOUTUBE_UPLOAD_APPROVED"],
    steps: ["Crie credenciais OAuth no Google Cloud Console.", "Ative YouTube Data API v3.", "Cadastre o callback Google copiado em System Status.", "Após verificação/teste de upload, YOUTUBE_UPLOAD_APPROVED=true."],
  },
  {
    id: "stripe",
    title: "Stripe",
    env: ["STRIPE_SECRET_KEY", "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY", "STRIPE_WEBHOOK_SECRET", "STRIPE_PRICE_CREATOR", "STRIPE_PRICE_PRO"],
    steps: [
      "Use somente chaves de TEST MODE no dashboard.stripe.com.",
      "Não crie produtos automaticamente por este app.",
      "Configure o webhook para /api/webhooks/stripe.",
      "Preencha STRIPE_PRICE_CREATOR e STRIPE_PRICE_PRO com Price IDs reais de teste.",
      "Cartões de teste: documentação oficial do Stripe (não há números na aplicação).",
    ],
  },
  {
    id: "storage",
    title: "Object storage",
    env: ["STORAGE_PROVIDER", "S3_ENDPOINT", "S3_REGION", "S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY", "S3_FORCE_PATH_STYLE"],
    steps: [
      "Desenvolvimento: STORAGE_PROVIDER=local (disco).",
      "Produção: STORAGE_PROVIDER=s3 (também vale R2/B2 S3-compatible).",
      "Preencha S3_BUCKET, S3_ACCESS_KEY_ID e S3_SECRET_ACCESS_KEY no servidor.",
      "R2/MinIO: defina S3_ENDPOINT e, se preciso, S3_FORCE_PATH_STYLE=true.",
      "Nunca coloque essas variáveis em NEXT_PUBLIC.",
    ],
  },
  {
    id: "redis",
    title: "Redis e worker",
    env: ["REDIS_URL", "WORKER_CONCURRENCY", "CLIPLAB_EMBED_WORKERS"],
    steps: [
      "Produção exige REDIS_URL. Sem Redis a fila pesada não sobe.",
      "Suba o processo separado: npm run worker.",
      "CLIPLAB_EMBED_WORKERS só em desenvolvimento.",
      "WORKER_CONCURRENCY controla FFmpeg/OpenAI no worker (padrão 1).",
    ],
  },
  {
    id: "smtp",
    title: "E-mail transacional",
    env: ["EMAIL_PROVIDER", "SMTP_HOST", "SMTP_PORT", "SMTP_SECURE", "SMTP_USER", "SMTP_PASSWORD", "SMTP_PASS", "SMTP_FROM", "EMAIL_FROM", "SMTP_FROM_NAME", "APP_URL"],
    steps: [
      "Defina EMAIL_PROVIDER=smtp.",
      "Preencha SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD (ou SMTP_PASS) e SMTP_FROM (ou EMAIL_FROM) no servidor web e no worker.",
      "Opcional: SMTP_SECURE=true em porta 465. SMTP_FROM_NAME=CLIPLAB.",
      "APP_URL deve ser a URL pública do app (links de verificação e senha).",
      "Reinicie o app. E-mails pendentes na outbox serão enviados automaticamente.",
    ],
  },
];

export function setupGuideFor(id: string) {
  return SETUP_GUIDES.find((guide) => guide.id === id) ?? null;
}
