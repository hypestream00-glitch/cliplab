import {
  META_AUTHORIZE_URL,
  META_GRAPH_BASE,
  META_SCOPES,
  META_TOKEN_URL,
  isMetaConfigured,
  metaAppId,
  metaAppSecret,
  metaRedirectUri,
} from "@/lib/social/meta/config";
import { MetaApiError, metaFetch, parseMetaError } from "@/lib/social/meta/http";
import type { MetaDiscoveredPage, MetaDiscovery } from "@/lib/social/meta/types";
import type { SocialTokenResult } from "@/lib/social/provider";
import { logger } from "@/lib/logger";

async function readJson(response: Response) {
  return (await response.json().catch(() => ({}))) as Record<string, unknown>;
}

export const metaOAuth = {
  getAuthorizationUrl(params: { state: string; redirectUri: string }) {
    if (!isMetaConfigured()) {
      throw new MetaApiError("Meta não está configurada.", "not_configured", 0, false);
    }
    const url = new URL(META_AUTHORIZE_URL);
    url.searchParams.set("client_id", metaAppId());
    url.searchParams.set("redirect_uri", params.redirectUri || metaRedirectUri());
    url.searchParams.set("state", params.state);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", META_SCOPES.join(","));
    return url.toString();
  },

  async exchangeCode(params: { code: string; redirectUri: string }): Promise<SocialTokenResult> {
    const short = await exchangeToken({
      client_id: metaAppId(),
      client_secret: metaAppSecret(),
      redirect_uri: params.redirectUri,
      code: params.code,
    });
    const longLived = await exchangeLongLived(short.accessToken);
    const profile = await fetchUser(longLived.accessToken);
    return {
      accessToken: longLived.accessToken,
      refreshToken: longLived.accessToken,
      expiresAt: longLived.expiresAt,
      refreshExpiresAt: longLived.expiresAt,
      scopes: short.scopes.length ? short.scopes : [...META_SCOPES],
      profile,
    };
  },

  async refreshLongLivedUserToken(userToken: string) {
    const longLived = await exchangeLongLived(userToken);
    return {
      accessToken: longLived.accessToken,
      refreshToken: longLived.accessToken,
      expiresAt: longLived.expiresAt,
      refreshExpiresAt: longLived.expiresAt,
    };
  },

  async discoverPages(userAccessToken: string): Promise<MetaDiscovery> {
    const me = await fetchUser(userAccessToken);
    const url = new URL(`${META_GRAPH_BASE}/me/accounts`);
    url.searchParams.set(
      "fields",
      "id,name,access_token,picture{url},tasks,instagram_business_account{id,username,name,profile_picture_url,account_type}",
    );
    url.searchParams.set("limit", "100");
    const response = await metaFetch(url.toString(), {
      headers: { Authorization: `Bearer ${userAccessToken}` },
    });
    const json = await readJson(response);
    if (!response.ok || json.error) throw parseMetaError(json, response.status);
    const data = Array.isArray(json.data) ? (json.data as Array<Record<string, unknown>>) : [];
    const pages = mapGraphPages(data);
    return {
      facebookUserId: me.externalAccountId,
      userAccessToken,
      scopes: [...META_SCOPES],
      pages,
    };
  },

  async pageAccessToken(userToken: string, pageId: string) {
    const discovery = await this.discoverPages(userToken);
    const page = discovery.pages.find((item) => item.id === pageId);
    if (!page) throw new MetaApiError("Página não encontrada ou sem acesso.", "page_unavailable", 404, false);
    return page;
  },

  async revoke(accessToken: string) {
    const response = await metaFetch(`${META_GRAPH_BASE}/me/permissions`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) {
      const json = await readJson(response);
      logger.warn({ code: (json.error as { code?: number } | undefined)?.code }, "meta revoke failed");
    }
  },
};

export function mapGraphPages(data: Array<Record<string, unknown>>): MetaDiscoveredPage[] {
  return data
    .map((page) => {
      const tasks = Array.isArray(page.tasks) ? page.tasks.map((item) => String(item)) : [];
      const ig = page.instagram_business_account as Record<string, unknown> | undefined;
      const picture = (page.picture as { data?: { url?: string } } | undefined)?.data?.url;
      return {
        id: String(page.id ?? ""),
        name: String(page.name ?? "Página"),
        picture,
        tasks,
        canCreateContent: tasks.includes("CREATE_CONTENT") || tasks.includes("MANAGE"),
        pageAccessToken: String(page.access_token ?? ""),
        instagram: ig?.id
          ? {
              id: String(ig.id),
              username: String(ig.username ?? ig.id),
              name: String(ig.name ?? ig.username ?? "Instagram"),
              avatarUrl: ig.profile_picture_url ? String(ig.profile_picture_url) : undefined,
              accountType: ig.account_type ? String(ig.account_type) : undefined,
            }
          : undefined,
      };
    })
    .filter((page) => page.id && page.pageAccessToken);
}

async function exchangeToken(params: Record<string, string>) {
  const url = new URL(META_TOKEN_URL);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  const response = await metaFetch(url.toString());
  const json = await readJson(response);
  if (!response.ok || json.error || !json.access_token) throw parseMetaError(json, response.status);
  const expiresIn = Number(json.expires_in ?? 3600);
  const scopes = String(json.scope ?? "")
    .split(/[,\s]+/)
    .map((item) => item.trim())
    .filter(Boolean);
  return {
    accessToken: String(json.access_token),
    expiresAt: new Date(Date.now() + expiresIn * 1000),
    scopes,
  };
}

async function exchangeLongLived(shortLivedToken: string) {
  const url = new URL(META_TOKEN_URL);
  url.searchParams.set("grant_type", "fb_exchange_token");
  url.searchParams.set("client_id", metaAppId());
  url.searchParams.set("client_secret", metaAppSecret());
  url.searchParams.set("fb_exchange_token", shortLivedToken);
  const response = await metaFetch(url.toString());
  const json = await readJson(response);
  if (!response.ok || json.error || !json.access_token) throw parseMetaError(json, response.status);
  const expiresIn = Number(json.expires_in ?? 60 * 24 * 3600);
  return {
    accessToken: String(json.access_token),
    expiresAt: new Date(Date.now() + expiresIn * 1000),
  };
}

async function fetchUser(accessToken: string) {
  const response = await metaFetch(`${META_GRAPH_BASE}/me?fields=id,name`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const json = await readJson(response);
  if (!response.ok || json.error) throw parseMetaError(json, response.status);
  const id = String(json.id ?? "");
  if (!id) throw new MetaApiError("Perfil Meta sem id.", "invalid_profile", 400, false);
  return {
    externalAccountId: id,
    username: String(json.name ?? id),
    displayName: String(json.name ?? "Facebook"),
  };
}
