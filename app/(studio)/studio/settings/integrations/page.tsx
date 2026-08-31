import { PageHeader } from "@/components/dashboard/primitives";
import { integrationStatus } from "@/lib/env/status";
import { tiktokContentPostingStatus, tiktokOAuthStatus } from "@/lib/social/tiktok/config";
import { metaInsightsStatus, metaOAuthStatus, metaPublishingStatus } from "@/lib/social/meta/config";
import { xOAuthStatus, xPublishingStatus } from "@/lib/social/x/config";
import { youtubeAnalyticsStatus, youtubeOAuthStatus, youtubeUploadStatus } from "@/lib/social/youtube/config";
import { DevNotice } from "@/components/dashboard/dev-notice";
import { isUploadPostPrimary, socialBackend } from "@/lib/social/router";
import { isUploadPostConfigured } from "@/lib/social/upload-post/config";

export default function IntegrationsPage() {
  const status = integrationStatus();
  const unified = isUploadPostPrimary();
  const rows = unified
    ? ([
        ["Social Provider", `Upload-Post (${socialBackend()})`],
        ["Upload-Post API", isUploadPostConfigured() ? "READY" : "CONFIG REQUIRED"],
        ["Stripe", status.stripe ? "Configurado" : "Configuração necessária"],
        ["OpenAI", status.openai ? "Configurado" : "Configuração necessária"],
        ["Redis", status.redis ? "Configurado" : "Configuração necessária"],
        ["Storage S3", status.storage ? "Configurado" : "Configuração necessária"],
        ["Providers nativos", "LEGACY / DISABLED"],
      ] as const)
    : ([
        ["Stripe", status.stripe ? "Configurado" : "Configuração necessária"],
        ["Stripe webhook", status.stripeWebhook ? "Configurado" : "Configuração necessária"],
        ["OpenAI", status.openai ? "Configurado" : "Configuração necessária"],
        ["Redis", status.redis ? "Configurado" : "Configuração necessária"],
        ["Storage S3", status.storage ? "Configurado" : "Configuração necessária"],
        ["Google Auth", status.googleAuth ? "Configurado" : "Configuração necessária"],
        ["TikTok OAuth", tiktokOAuthStatus()],
        ["TikTok Content Posting", tiktokContentPostingStatus()],
        ["Meta OAuth", metaOAuthStatus()],
        ["Instagram Publishing", metaPublishingStatus("instagram")],
        ["Facebook Publishing", metaPublishingStatus("facebook")],
        ["Insights", metaInsightsStatus()],
        ["X OAuth", xOAuthStatus()],
        ["X Publishing", xPublishingStatus()],
        ["YouTube OAuth", youtubeOAuthStatus()],
        ["YouTube Upload", youtubeUploadStatus()],
        ["YouTube Analytics", youtubeAnalyticsStatus()],
      ] as const);

  return (
    <div>
      <PageHeader title="Integrações" description="Provedor social unificado, storage e webhooks. Sem senhas de plataforma e sem secrets na tela." />
      <div className="mb-4">
        {unified ? (
          <DevNotice>
            Padrão: Upload-Post. Sem UPLOAD_POST_API_KEY a UI mostra CONFIG REQUIRED — CLIPLAB não finge OAuth nem pede senha.
          </DevNotice>
        ) : (
          <DevNotice>
            TikTok, Meta, X e YouTube só publicam de verdade com credenciais oficiais. Sem chaves a UI mostra Configuração necessária — CLIPLAB não finge OAuth nem pede senha.
          </DevNotice>
        )}
      </div>
      <div className="space-y-2 text-[13px]">
        {rows.map(([name, ready]) => (
          <div key={name} className="flex items-center justify-between rounded-md border px-3 py-2">
            <span>{name}</span>
            <span className="text-muted-foreground">{ready}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
