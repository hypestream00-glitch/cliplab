import { META_GRAPH_BASE } from "@/lib/social/meta/config";
import { MetaApiError, metaFetch, parseMetaError } from "@/lib/social/meta/http";
import { mapInstagramContainerStatus } from "@/lib/social/meta/types";
import type { SocialProvider } from "@/lib/social/provider";
import { metaOAuth } from "@/lib/social/meta/oauth";
import { logger } from "@/lib/logger";

async function readJson(response: Response) {
  return (await response.json().catch(() => ({}))) as Record<string, unknown>;
}

export const instagramProvider: SocialProvider = {
  platform: "INSTAGRAM",
  mocked: false,
  configured: true,
  getAuthorizationUrl({ state, redirectUri }) {
    return metaOAuth.getAuthorizationUrl({ state, redirectUri });
  },
  async handleCallback({ code, redirectUri }) {
    return metaOAuth.exchangeCode({ code, redirectUri });
  },
  async exchangeCode({ code, redirectUri }) {
    return metaOAuth.exchangeCode({ code, redirectUri });
  },
  async refreshAccessToken(userToken) {
    return metaOAuth.refreshLongLivedUserToken(userToken);
  },
  async revokeAccess(accessToken) {
    await metaOAuth.revoke(accessToken);
  },
  async getProfile(accessToken) {
    const response = await metaFetch(`${META_GRAPH_BASE}/me?fields=id,username,name,profile_picture_url`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const json = await readJson(response);
    if (!response.ok || json.error) throw parseMetaError(json, response.status);
    const username = String(json.username ?? json.id ?? "instagram");
    return {
      externalAccountId: String(json.id ?? "unknown"),
      username,
      displayName: String(json.name ?? username),
      avatarUrl: json.profile_picture_url ? String(json.profile_picture_url) : undefined,
    };
  },
  async initializeVideoPost(params) {
    if (!params?.accessToken || !params.igUserId || !params.videoUrl) {
      throw new MetaApiError("Parâmetros de publicação Instagram incompletos.", "invalid_request", 400, false);
    }
    const body: Record<string, unknown> = {
      media_type: "REELS",
      video_url: params.videoUrl,
      caption: params.title ?? "",
      share_to_feed: params.shareToFeed !== false,
      access_token: params.accessToken,
    };
    const response = await metaFetch(`${META_GRAPH_BASE}/${encodeURIComponent(params.igUserId)}/media`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await readJson(response);
    if (!response.ok || json.error || !json.id) throw parseMetaError(json, response.status);
    return {
      publishId: String(json.id),
      uploadUrl: params.videoUrl,
      chunkSize: 0,
      totalChunkCount: 0,
    };
  },
  async publishVideo(params) {
    if (!params) throw new MetaApiError("Parâmetros de publicação Instagram incompletos.", "invalid_request", 400, false);
    const init = await instagramProvider.initializeVideoPost?.(params);
    if (!init) throw new MetaApiError("Falha ao criar container Instagram.", "invalid_response", 400, false);
    return { publishId: init.publishId, mocked: false as const };
  },
  async getPostStatus(params) {
    if (!params?.accessToken || !params.publishId) {
      throw new MetaApiError("container_id ausente.", "invalid_request", 400, false);
    }
    const response = await metaFetch(
      `${META_GRAPH_BASE}/${encodeURIComponent(params.publishId)}?fields=status_code,status`,
      { headers: { Authorization: `Bearer ${params.accessToken}` } },
    );
    const json = await readJson(response);
    if (!response.ok || json.error) throw parseMetaError(json, response.status);
    const code = String(json.status_code ?? json.status ?? "IN_PROGRESS");
    return {
      status: mapInstagramContainerStatus(code),
      failReason: code === "ERROR" || code === "EXPIRED" ? String(json.status ?? code) : undefined,
    };
  },
  async getMetrics(params) {
    const empty = {
      followers: null,
      views: null,
      likes: null,
      comments: null,
      shares: null,
      posts: null,
      available: { followers: false, views: false, likes: false, comments: false, shares: false, posts: false },
    };
    if (!params?.accessToken || !params.igUserId) return empty;
    const response = await metaFetch(
      `${META_GRAPH_BASE}/${encodeURIComponent(params.igUserId)}?fields=followers_count,media_count,username`,
      { headers: { Authorization: `Bearer ${params.accessToken}` } },
    );
    const json = await readJson(response);
    if (!response.ok || json.error) {
      return { ...empty, raw: { error: (json.error as { code?: number } | undefined)?.code } };
    }
    const followers = json.followers_count != null ? Number(json.followers_count) : null;
    const posts = json.media_count != null ? Number(json.media_count) : null;
    return {
      followers,
      views: null,
      likes: null,
      comments: null,
      shares: null,
      posts,
      available: {
        followers: followers != null,
        views: false,
        likes: false,
        comments: false,
        shares: false,
        posts: posts != null,
      },
      raw: { user: { followers_count: json.followers_count, media_count: json.media_count } },
    };
  },
  async disconnect(params) {
    if (params?.accessToken) {
      try {
        await metaOAuth.revoke(params.accessToken);
      } catch (error) {
        logger.warn({ err: error }, "meta instagram revoke failed");
      }
    }
  },
};

export const unconfiguredInstagramProvider: SocialProvider = {
  platform: "INSTAGRAM",
  mocked: false,
  configured: false,
  getAuthorizationUrl() {
    throw new MetaApiError("Instagram não está configurado. Defina META_APP_ID e META_APP_SECRET.", "not_configured", 0, false);
  },
  async handleCallback() {
    throw new MetaApiError("Instagram não está configurado.", "not_configured", 0, false);
  },
  async refreshAccessToken() {
    throw new MetaApiError("Instagram não está configurado.", "not_configured", 0, false);
  },
  async getProfile() {
    throw new MetaApiError("Instagram não está configurado.", "not_configured", 0, false);
  },
  async publishVideo() {
    throw new MetaApiError("Instagram não está configurado.", "not_configured", 0, false);
  },
  async getPostStatus() {
    throw new MetaApiError("Instagram não está configurado.", "not_configured", 0, false);
  },
  async getMetrics() {
    return {
      followers: null,
      views: null,
      likes: null,
      comments: null,
      shares: null,
      posts: null,
      available: { followers: false, views: false, likes: false, comments: false, shares: false, posts: false },
    };
  },
  async disconnect() {},
};

export async function publishInstagramContainer(igUserId: string, containerId: string, accessToken: string) {
  const response = await metaFetch(`${META_GRAPH_BASE}/${encodeURIComponent(igUserId)}/media_publish`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ creation_id: containerId, access_token: accessToken }),
  });
  const json = await readJson(response);
  if (!response.ok || json.error || !json.id) throw parseMetaError(json, response.status);
  return String(json.id);
}

export async function fetchInstagramContainerStatus(accessToken: string, containerId: string) {
  const response = await metaFetch(`${META_GRAPH_BASE}/${encodeURIComponent(containerId)}?fields=status_code,status`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const json = await readJson(response);
  if (!response.ok || json.error) throw parseMetaError(json, response.status);
  return String(json.status_code ?? "IN_PROGRESS");
}
