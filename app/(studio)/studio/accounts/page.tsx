import { requireWorkspaceContext } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { EmptyState, PageHeader, StatusBadge } from "@/components/dashboard/primitives";
import { PLATFORM_CAPABILITIES } from "@/lib/social/provider";
import { getSupportedPlatforms } from "@/lib/social/upload-post/platforms";
import { fromNow } from "@/lib/utils/format";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import {
  refreshSocialAccountsAction,
  syncMetaAccountAction,
  syncTikTokAccountAction,
  syncXAccountAction,
  syncYouTubeAccountAction,
} from "@/app/(studio)/studio/accounts/actions";
import { DisconnectAccountButton, MetaConfigNotice, TikTokConfigNotice, XConfigNotice, YouTubeConfigNotice, TwitchConfigNotice, KickConfigNotice, BilibiliConfigNotice } from "@/components/accounts/tiktok-account-actions";
import { ConnectSuccessToast } from "@/components/accounts/connect-success-toast";
import { platformNeedsConfig } from "@/lib/social/oauth";
import { tiktokContentPostingStatus, tiktokOAuthStatus } from "@/lib/social/tiktok/config";
import { metaInsightsStatus, metaOAuthStatus, metaPublishingStatus } from "@/lib/social/meta/config";
import { xOAuthStatus, xPublishingStatus } from "@/lib/social/x/config";
import { youtubeAnalyticsStatus, youtubeOAuthStatus, youtubeUploadStatus } from "@/lib/social/youtube/config";
import { accountDisplayStatus } from "@/lib/services/social-accounts";
import { DataBadge } from "@/components/ui/data-badge";
import type { PageSearchProps } from "@/types/routes";
import type { MetaProviderMeta } from "@/lib/social/meta/types";
import { isUploadPostPrimary } from "@/lib/social/router";
import { isUploadPostConfigured } from "@/lib/social/upload-post/config";
import { ensureUploadPostProfile } from "@/lib/social/upload-post/profiles";
import { syncUploadPostAccounts } from "@/lib/social/upload-post/accounts";
import { UploadPostApiError, UploadPostPlanError } from "@/lib/social/upload-post/errors";
import { visibleSocialAccountWhere } from "@/lib/data/visibility";
import { logger } from "@/lib/logger";
import {
  NATIVE_OAUTH_PLATFORMS,
  YOUTUBE_NATIVE_CONNECT_HREF,
  secondaryAccountsConnect,
  shouldPrepareUploadPostProfileOnAccountsLoad,
  shouldSurfaceUploadPostProfileError,
  uploadPostGridPlatforms,
} from "@/lib/social/accounts-connect";
import {
  CAPABILITY_LABELS,
  ECOSYSTEM_PLATFORMS,
  getPlatformCapabilities,
  type EcosystemPlatform,
} from "@/lib/platforms/capabilities";
import { PlatformCapabilityBadge } from "@/components/platforms/capability-badge";
import { socialPlatformLabel } from "@/lib/social/labels";

const PLATFORMS = getSupportedPlatforms();

const ERRORS: Record<string, string> = {
  "upload-post-config": "Ainda não é possível conectar redes. Peça ao administrador para concluir a configuração.",
  "plan-limit": "Você atingiu o limite de contas sociais do seu plano.",
  "profile-limit": "Limite de perfis sociais atingido no plano atual.",
  "invalid-connect-url": "Não foi possível abrir a conexão de redes sociais. Tente de novo.",
  "tiktok-config": "Configure TIKTOK_CLIENT_KEY e TIKTOK_CLIENT_SECRET no servidor.",
  "tiktok-state": "State OAuth inválido ou expirado. Tente conectar de novo.",
  "tiktok-denied": "Autorização recusada no TikTok.",
  "tiktok-oauth": "Falha no OAuth TikTok.",
  "meta-config": "Configure META_APP_ID e META_APP_SECRET no servidor.",
  "x-config": "Configure X_CLIENT_ID e X_CLIENT_SECRET no servidor.",
  "youtube-config": "Configure GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET (ou AUTH_GOOGLE_*) no servidor.",
  "twitch-config": "Configure TWITCH_CLIENT_ID e TWITCH_CLIENT_SECRET no servidor.",
  "kick-config": "Configure KICK_CLIENT_ID e KICK_CLIENT_SECRET no servidor.",
  "bilibili-config": "Configure BILIBILI_CLIENT_ID e BILIBILI_CLIENT_SECRET no servidor.",
  "oauth-state": "State OAuth inválido ou expirado. Tente conectar de novo.",
  "oauth-denied": "Autorização recusada.",
  not_configured: "A integração ainda não está configurada.",
  invalid_grant: "Código de autorização inválido. Tente conectar de novo.",
  invalid_client: "Credenciais OAuth inválidas.",
  plan_restriction: "O plano da API do X não permite esta operação.",
  api_access_required: "O app ainda não tem acesso de escrita na API do X.",
  missing_scope: "Escopos insuficientes. Reconecte a conta e aceite as permissões pedidas.",
  youtubeSignupRequired: "Esta conta Google não tem canal YouTube.",
  quotaExceeded: "Quota da YouTube Data API esgotada.",
};

export const metadata = { title: "Contas" };

export default async function AccountsPage({ searchParams }: PageSearchProps) {
  const { workspace } = await requireWorkspaceContext();
  const query = await searchParams;
  const error = typeof query.error === "string" ? query.error : "";
  const connected = typeof query.connected === "string" ? query.connected : "";
  const connectStatus = typeof query.connect_status === "string" ? query.connect_status : "";
  const unified = isUploadPostPrimary();
  const configured = isUploadPostConfigured();
  const secondaryConnect = secondaryAccountsConnect();
  const justConnected = connected === "1" || connectStatus === "success";
  let profileError = "";
  if (shouldPrepareUploadPostProfileOnAccountsLoad()) {
    try {
      await ensureUploadPostProfile(workspace.id);
      await syncUploadPostAccounts(workspace.id);
    } catch (err) {
      logger.warn(
        {
          errType: err instanceof Error ? err.name : "Error",
          status: err instanceof UploadPostApiError ? err.status : undefined,
          errorCode: err instanceof UploadPostApiError ? err.code : undefined,
          provider: "UPLOAD_POST",
        },
        "upload-post profile prepare failed",
      );
      if (shouldSurfaceUploadPostProfileError()) {
        profileError =
          err instanceof UploadPostPlanError
            ? err.message
            : "Não foi possível preparar o perfil de redes sociais. Tente Atualizar contas.";
      }
    }
  }
  const accounts = await prisma.socialAccount.findMany({
    where: visibleSocialAccountWhere(workspace.id),
    orderBy: { createdAt: "desc" },
  });

  if (unified) {
    return (
      <div>
        <PageHeader
        title="Contas sociais"
        description="Conecte suas redes para publicar e agendar seus clips."
          actions={
            <div className="flex flex-wrap gap-2">
              <Button size="sm" asChild>
                <a href={YOUTUBE_NATIVE_CONNECT_HREF}>+ Conectar conta</a>
              </Button>
              {secondaryConnect ? (
                <Button size="sm" variant="outline" asChild>
                  <a href={secondaryConnect.href}>{secondaryConnect.label}</a>
                </Button>
              ) : null}
              {configured ? (
                <form action={refreshSocialAccountsAction}>
                  <Button size="sm" variant="outline" type="submit">
                    Atualizar contas
                  </Button>
                </form>
              ) : null}
            </div>
          }
        />
        <ConnectSuccessToast show={justConnected} accountCount={accounts.length} />
        {profileError ? <p className="mb-3 text-[12px] text-destructive">{profileError}</p> : null}
        {error ? <p className="mb-3 text-[12px] text-destructive">{ERRORS[error] ?? error}</p> : null}
        {accounts.length === 0 ? (
          <EmptyState
            title="Nenhuma conta conectada."
            description="Clique em Conectar conta e autorize o YouTube na sua conta Google."
          />
        ) : null}
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {uploadPostGridPlatforms(accounts).map((platform) => {
            const platformAccounts = accounts.filter((account) => account.platform === platform);
            const capabilities = PLATFORM_CAPABILITIES[platform];
            return (
              <article key={platform} id={platform.toLowerCase()} className="rounded-2xl border border-border bg-card p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[13px] font-semibold">{platform}</p>
                    {platformAccounts.length === 0 ? (
                      <p className="text-[12px] text-muted-foreground">Não conectada</p>
                    ) : (
                      <p className="text-[12px] text-muted-foreground">
                        {platformAccounts.length} conta{platformAccounts.length > 1 ? "s" : ""}
                      </p>
                    )}
                  </div>
                  {platformAccounts.length === 0 ? <StatusBadge status="OFFLINE" /> : null}
                </div>
                <p className="mt-2 text-[11px] text-muted-foreground">
                  {capabilities.canPublishVideo ? "Publicação de vídeo" : "Sem publicação de vídeo"}
                </p>
                {ECOSYSTEM_PLATFORMS.includes(platform as EcosystemPlatform) ? (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {(["trending", "postMetrics", "competitionTracking", "publish"] as const).map((key) => {
                      const state = getPlatformCapabilities(platform as EcosystemPlatform)[key];
                      return <PlatformCapabilityBadge key={key} state={state} label={CAPABILITY_LABELS[key]} />;
                    })}
                  </div>
                ) : null}
                <div className="mt-3 space-y-3">
                  {platformAccounts.map((account) => {
                    const status = accountDisplayStatus(account);
                    return (
                      <div key={account.id} className="rounded-md border px-2.5 py-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2">
                            {account.avatarUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={account.avatarUrl} alt="" className="size-8 rounded-full object-cover" />
                            ) : (
                              <div className="flex size-8 items-center justify-center rounded-full bg-muted text-[10px] font-semibold">
                                {platform.slice(0, 2)}
                              </div>
                            )}
                            <div>
                              <p className="flex items-center gap-1.5 text-[12px] font-medium">
                                {account.displayName}
                                {account.mock ? <DataBadge kind="DEMO" /> : null}
                              </p>
                              <p className="text-[11px] text-muted-foreground">@{account.username}</p>
                            </div>
                          </div>
                          <StatusBadge status={status} />
                        </div>
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          {account.lastSyncAt ? `sync ${fromNow(account.lastSyncAt)}` : "ainda não sincronizada"}
                          {account.mock ? " · DEMO" : ""}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <Button size="sm" variant="outline" asChild>
                            <Link href={`/studio/metrics/accounts/${account.id}`}>Métricas</Link>
                          </Button>
                          <form action={refreshSocialAccountsAction}>
                            <Button size="sm" variant="outline" type="submit">
                              Atualizar
                            </Button>
                          </form>
                          <DisconnectAccountButton accountId={account.id} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </article>
            );
          })}
        </div>
        <h2 className="mt-8 mb-3 text-[14px] font-semibold">Plataformas nativas</h2>
        <p className="mb-3 text-[12px] text-muted-foreground">
          YouTube, Twitch, Kick e Bilibili usam OAuth oficial separado do Upload-Post. Tokens ficam só no servidor.
        </p>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {NATIVE_OAUTH_PLATFORMS.map((platform) => {
            const platformAccounts = accounts.filter((account) => account.platform === platform);
            const caps = getPlatformCapabilities(platform);
            const needs = platformNeedsConfig(platform);
            return (
              <article key={platform} id={platform.toLowerCase()} className="rounded-2xl border border-border bg-card p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[13px] font-semibold">{socialPlatformLabel(platform)}</p>
                    {platformAccounts.length === 0 ? (
                      <p className="text-[12px] text-muted-foreground">{needs ? "Aguardando credenciais" : "Não conectada"}</p>
                    ) : (
                      <p className="text-[12px] text-muted-foreground">
                        {platformAccounts.length} conta{platformAccounts.length > 1 ? "s" : ""}
                      </p>
                    )}
                  </div>
                  {platformAccounts.length === 0 ? <StatusBadge status="OFFLINE" /> : null}
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {(["trending", "oauth", "live", "publish", "competitionTracking"] as const).map((key) => (
                    <PlatformCapabilityBadge key={key} state={caps[key]} label={CAPABILITY_LABELS[key]} />
                  ))}
                </div>
                <div className="mt-3 space-y-3">
                  {platformAccounts.map((account) => (
                    <div key={account.id} className="rounded-md border px-2.5 py-2">
                      <p className="text-[12px] font-medium">{account.displayName}</p>
                      <p className="text-[11px] text-muted-foreground">@{account.username}</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Button size="sm" variant="outline" asChild>
                          <Link href={`/api/social/oauth/start?platform=${platform}`}>Reconectar</Link>
                        </Button>
                        <DisconnectAccountButton accountId={account.id} />
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-3">
                  {needs ? (
                    platform === "YOUTUBE" ? (
                      <YouTubeConfigNotice />
                    ) : platform === "TWITCH" ? (
                      <TwitchConfigNotice />
                    ) : platform === "KICK" ? (
                      <KickConfigNotice />
                    ) : (
                      <BilibiliConfigNotice />
                    )
                  ) : (
                    <Button size="sm" asChild>
                      {platform === "YOUTUBE" ? (
                        <a href={`/api/social/oauth/start?platform=${platform}`}>Conectar {socialPlatformLabel(platform)}</a>
                      ) : (
                        <Link href={`/api/social/oauth/start?platform=${platform}`}>Conectar {socialPlatformLabel(platform)}</Link>
                      )}
                    </Button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </div>
    );
  }

  const tiktokNeedsConfig = platformNeedsConfig("TIKTOK");
  const metaNeedsConfig = platformNeedsConfig("INSTAGRAM");
  const xNeedsConfig = platformNeedsConfig("X");
  const youtubeNeedsConfig = platformNeedsConfig("YOUTUBE");
  const twitchNeedsConfig = platformNeedsConfig("TWITCH");
  const kickNeedsConfig = platformNeedsConfig("KICK");
  const bilibiliNeedsConfig = platformNeedsConfig("BILIBILI");
  const nativePlatforms = Array.from(new Set([...PLATFORMS, ...ECOSYSTEM_PLATFORMS]));

  return (
    <div>
      <PageHeader title="Contas" description="Conecte redes via OAuth nativo (fallback). CortaClip nunca pede senha da plataforma." />
      <div className="mb-3 flex flex-wrap gap-2 text-[11px]">
        <span className="rounded-md border px-2 py-0.5">TikTok OAuth: {tiktokOAuthStatus()}</span>
        <span className="rounded-md border px-2 py-0.5">Content Posting: {tiktokContentPostingStatus()}</span>
        <span className="rounded-md border px-2 py-0.5">Meta OAuth: {metaOAuthStatus()}</span>
        <span className="rounded-md border px-2 py-0.5">Instagram Publishing: {metaPublishingStatus("instagram")}</span>
        <span className="rounded-md border px-2 py-0.5">Facebook Publishing: {metaPublishingStatus("facebook")}</span>
        <span className="rounded-md border px-2 py-0.5">Insights: {metaInsightsStatus()}</span>
        <span className="rounded-md border px-2 py-0.5">X OAuth: {xOAuthStatus()}</span>
        <span className="rounded-md border px-2 py-0.5">X Publishing: {xPublishingStatus()}</span>
        <span className="rounded-md border px-2 py-0.5">YouTube OAuth: {youtubeOAuthStatus()}</span>
        <span className="rounded-md border px-2 py-0.5">YouTube Upload: {youtubeUploadStatus()}</span>
        <span className="rounded-md border px-2 py-0.5">YouTube Analytics: {youtubeAnalyticsStatus()}</span>
      </div>
      {connected === "tiktok" ? <p className="mb-3 text-[12px] text-emerald-300">Conta TikTok conectada.</p> : null}
      {connected === "meta" ? <p className="mb-3 text-[12px] text-emerald-300">Conta Meta conectada.</p> : null}
      {connected === "x" ? <p className="mb-3 text-[12px] text-emerald-300">Conta X conectada.</p> : null}
      {connected === "youtube" ? <p className="mb-3 text-[12px] text-emerald-300">Canal YouTube conectado.</p> : null}
      {error ? <p className="mb-3 text-[12px] text-destructive">{ERRORS[error] ?? "Não foi possível concluir o OAuth."}</p> : null}
      {accounts.length === 0 ? (
        <EmptyState title="Nenhuma conta conectada." description="Conecte TikTok, Instagram ou Facebook via OAuth oficial." actionLabel="Ver Instagram" actionHref="/studio/accounts#instagram" />
      ) : null}
      <div id="connect" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {nativePlatforms.map((platform) => {
          const platformAccounts = accounts.filter((account) => account.platform === platform);
          const capabilities = PLATFORM_CAPABILITIES[platform];
          const needsConfig =
            (platform === "TIKTOK" && tiktokNeedsConfig) ||
            ((platform === "INSTAGRAM" || platform === "FACEBOOK") && metaNeedsConfig) ||
            (platform === "X" && xNeedsConfig) ||
            (platform === "YOUTUBE" && youtubeNeedsConfig) ||
            (platform === "TWITCH" && twitchNeedsConfig) ||
            (platform === "KICK" && kickNeedsConfig) ||
            (platform === "BILIBILI" && bilibiliNeedsConfig);
          const official =
            platform === "TIKTOK" ||
            platform === "INSTAGRAM" ||
            platform === "FACEBOOK" ||
            platform === "X" ||
            platform === "YOUTUBE" ||
            platform === "TWITCH" ||
            platform === "KICK" ||
            platform === "BILIBILI";
          return (
            <article
              key={platform}
              id={
                platform === "TIKTOK"
                  ? "tiktok"
                  : platform === "INSTAGRAM"
                    ? "instagram"
                    : platform === "FACEBOOK"
                      ? "facebook"
                      : platform === "X"
                        ? "x"
                        : platform === "YOUTUBE"
                          ? "youtube"
                          : undefined
              }
              className="rounded-2xl border border-border bg-card p-5"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[13px] font-semibold">{platform}</p>
                  {platformAccounts.length === 0 ? (
                    needsConfig && official ? (
                      <p className="text-[12px] text-amber-200">Configuração necessária</p>
                    ) : (
                      <p className="text-[12px] text-muted-foreground">Não conectada</p>
                    )
                  ) : (
                    <p className="text-[12px] text-muted-foreground">
                      {platformAccounts.length} conta{platformAccounts.length > 1 ? "s" : ""}
                    </p>
                  )}
                </div>
                {platformAccounts.length === 0 ? <StatusBadge status="OFFLINE" /> : null}
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground">
                {capabilities.canPublishVideo ? "Publicação de vídeo" : "Sem publicação de vídeo"}
              </p>
              <div className="mt-3 space-y-3">
                {platformAccounts.map((account) => {
                  const meta = (account.providerMeta ?? {}) as MetaProviderMeta;
                  const status = accountDisplayStatus(account);
                  return (
                    <div key={account.id} className="rounded-md border px-2.5 py-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          {account.avatarUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={account.avatarUrl} alt="" className="size-8 rounded-full object-cover" />
                          ) : (
                            <div className="flex size-8 items-center justify-center rounded-full bg-muted text-[10px] font-semibold">
                              {platform.slice(0, 2)}
                            </div>
                          )}
                          <div>
                            <p className="flex items-center gap-1.5 text-[12px] font-medium">
                              {account.displayName}
                              {account.mock ? <DataBadge kind="DEMO" /> : null}
                            </p>
                            <p className="text-[11px] text-muted-foreground">
                              @{account.username}
                              {meta.accountType ? ` · ${meta.accountType}` : platform === "FACEBOOK" ? " · Page" : ""}
                              {platform === "YOUTUBE" && !account.mock ? " · Canal" : ""}
                            </p>
                          </div>
                        </div>
                        <StatusBadge status={status} />
                      </div>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        {account.lastSyncAt ? `sync ${fromNow(account.lastSyncAt)}` : "ainda não sincronizada"}
                        {account.mock ? " · DEMO/mock (não é conexão real)" : ""}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Button size="sm" variant="outline" asChild>
                          <Link href={`/studio/metrics/accounts/${account.id}`}>Métricas</Link>
                        </Button>
                        {platform === "TIKTOK" && !account.mock ? (
                          <form action={syncTikTokAccountAction}>
                            <input type="hidden" name="accountId" value={account.id} />
                            <Button size="sm" variant="outline" type="submit">
                              Sincronizar
                            </Button>
                          </form>
                        ) : null}
                        {(platform === "INSTAGRAM" || platform === "FACEBOOK") && !account.mock ? (
                          <form action={syncMetaAccountAction}>
                            <input type="hidden" name="accountId" value={account.id} />
                            <Button size="sm" variant="outline" type="submit">
                              Sincronizar
                            </Button>
                          </form>
                        ) : null}
                        {platform === "X" && !account.mock ? (
                          <form action={syncXAccountAction}>
                            <input type="hidden" name="accountId" value={account.id} />
                            <Button size="sm" variant="outline" type="submit">
                              Sincronizar
                            </Button>
                          </form>
                        ) : null}
                        {platform === "YOUTUBE" && !account.mock ? (
                          <form action={syncYouTubeAccountAction}>
                            <input type="hidden" name="accountId" value={account.id} />
                            <Button size="sm" variant="outline" type="submit">
                              Sincronizar
                            </Button>
                          </form>
                        ) : null}
                        {official && !account.mock ? (
                          <Button size="sm" variant="outline" asChild>
                            <Link href={`/api/social/oauth/start?platform=${platform}`}>Reconectar</Link>
                          </Button>
                        ) : null}
                        <DisconnectAccountButton accountId={account.id} />
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {platform === "TIKTOK" && tiktokNeedsConfig ? (
                  <TikTokConfigNotice />
                ) : (platform === "INSTAGRAM" || platform === "FACEBOOK") && metaNeedsConfig ? (
                  <MetaConfigNotice platform={platform} />
                ) : platform === "X" && xNeedsConfig ? (
                  <XConfigNotice />
                ) : platform === "YOUTUBE" && youtubeNeedsConfig ? (
                  <YouTubeConfigNotice />
                ) : platform === "TWITCH" && twitchNeedsConfig ? (
                  <TwitchConfigNotice />
                ) : platform === "KICK" && kickNeedsConfig ? (
                  <KickConfigNotice />
                ) : platform === "BILIBILI" && bilibiliNeedsConfig ? (
                  <BilibiliConfigNotice />
                ) : official ? (
                  <Button size="sm" asChild>
                    <Link href={`/api/social/oauth/start?platform=${platform}`}>
                      {platform === "INSTAGRAM"
                        ? "Conectar Instagram"
                        : platform === "FACEBOOK"
                          ? "Conectar Facebook"
                          : platform === "X"
                            ? platformAccounts.some((account) => !account.mock)
                              ? "Conectar outra"
                              : "Conectar X"
                            : platform === "YOUTUBE"
                              ? platformAccounts.some((account) => !account.mock)
                                ? "Conectar outro canal"
                                : "Conectar YouTube"
                              : platformAccounts.length
                                ? "Conectar outra"
                                : "Conectar"}
                    </Link>
                  </Button>
                ) : (
                  <p className="text-[12px] text-muted-foreground">Não disponível nesta versão.</p>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
