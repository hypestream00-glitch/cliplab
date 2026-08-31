import { createReadStream } from "node:fs";
import { META_GRAPH_BASE, META_RUPLOAD_BASE } from "@/lib/social/meta/config";
import { MetaApiError, metaFetch, parseMetaError } from "@/lib/social/meta/http";
import { mapFacebookVideoStatus } from "@/lib/social/meta/types";
import type { SocialProvider } from "@/lib/social/provider";
import { metaOAuth } from "@/lib/social/meta/oauth";
import { logger } from "@/lib/logger";

async function readJson(response: Response) {
  return (await response.json().catch(() => ({}))) as Record<string, unknown>;
}

export const facebookProvider: SocialProvider = {
  platform: "FACEBOOK",
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
    const response = await metaFetch(`${META_GRAPH_BASE}/me?fields=id,name`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const json = await readJson(response);
    if (!response.ok || json.error) throw parseMetaError(json, response.status);
    return {
      externalAccountId: String(json.id ?? "unknown"),
      username: String(json.name ?? json.id ?? "facebook"),
      displayName: String(json.name ?? "Facebook"),
    };
  },
  async publishVideo(params) {
    if (!params?.accessToken || !params.videoPath || !params.videoSize) {
      throw new MetaApiError("Parâmetros de publicação Facebook incompletos.", "invalid_request", 400, false);
    }
    const pageId = params.pageId;
    if (!pageId) throw new MetaApiError("Page ID ausente.", "invalid_request", 400, false);
    const start = await metaFetch(`${META_GRAPH_BASE}/${encodeURIComponent(pageId)}/video_reels`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ upload_phase: "start", access_token: params.accessToken }),
    });
    const startJson = await readJson(start);
    if (!start.ok || startJson.error) throw parseMetaError(startJson, start.status);
    const videoId = String(startJson.video_id ?? "");
    if (!videoId) throw new MetaApiError("Facebook não retornou video_id.", "invalid_response", 400, false);
    const uploadUrl = `${META_RUPLOAD_BASE}/${encodeURIComponent(videoId)}`;
    const stream = createReadStream(params.videoPath);
    const upload = await fetch(uploadUrl, {
      method: "POST",
      headers: {
        Authorization: `OAuth ${params.accessToken}`,
        offset: "0",
        file_size: String(params.videoSize),
        "Content-Type": "application/octet-stream",
      },
      body: stream as unknown as BodyInit,
      duplex: "half",
    } as RequestInit);
    const uploadJson = await upload.json().catch(() => ({})) as { success?: boolean; error?: unknown };
    if (!upload.ok || uploadJson.error || uploadJson.success === false) {
      throw parseMetaError(uploadJson, upload.status);
    }
    const finish = await metaFetch(`${META_GRAPH_BASE}/${encodeURIComponent(pageId)}/video_reels`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        upload_phase: "finish",
        video_id: videoId,
        video_state: "PUBLISHED",
        description: params.title ?? "",
        access_token: params.accessToken,
      }),
    });
    const finishJson = await readJson(finish);
    if (!finish.ok || finishJson.error) throw parseMetaError(finishJson, finish.status);
    return { publishId: videoId, externalPostId: videoId, mocked: false as const };
  },
  async getPostStatus(params) {
    if (!params?.accessToken || !params.publishId) {
      throw new MetaApiError("video_id ausente.", "invalid_request", 400, false);
    }
    const response = await metaFetch(
      `${META_GRAPH_BASE}/${encodeURIComponent(params.publishId)}?fields=status`,
      { headers: { Authorization: `Bearer ${params.accessToken}` } },
    );
    const json = await readJson(response);
    if (!response.ok || json.error) throw parseMetaError(json, response.status);
    const mapped = mapFacebookVideoStatus((json.status ?? {}) as Parameters<typeof mapFacebookVideoStatus>[0]);
    return { status: mapped.status, failReason: mapped.error, postIds: mapped.status === "PUBLISHED" ? [params.publishId] : undefined };
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
    if (!params?.accessToken || !params.pageId) return empty;
    const response = await metaFetch(
      `${META_GRAPH_BASE}/${encodeURIComponent(params.pageId)}?fields=fan_count,followers_count,name`,
      { headers: { Authorization: `Bearer ${params.accessToken}` } },
    );
    const json = await readJson(response);
    if (!response.ok || json.error) {
      return { ...empty, raw: { error: (json.error as { code?: number } | undefined)?.code } };
    }
    const followers = json.followers_count != null ? Number(json.followers_count) : json.fan_count != null ? Number(json.fan_count) : null;
    return {
      followers,
      views: null,
      likes: null,
      comments: null,
      shares: null,
      posts: null,
      available: {
        followers: followers != null,
        views: false,
        likes: false,
        comments: false,
        shares: false,
        posts: false,
      },
      raw: { page: { fan_count: json.fan_count, followers_count: json.followers_count } },
    };
  },
  async disconnect(params) {
    if (params?.accessToken) {
      try {
        await metaOAuth.revoke(params.accessToken);
      } catch (error) {
        logger.warn({ err: error }, "meta facebook revoke failed");
      }
    }
  },
};

export const unconfiguredFacebookProvider: SocialProvider = {
  platform: "FACEBOOK",
  mocked: false,
  configured: false,
  getAuthorizationUrl() {
    throw new MetaApiError("Facebook não está configurado. Defina META_APP_ID e META_APP_SECRET.", "not_configured", 0, false);
  },
  async handleCallback() {
    throw new MetaApiError("Facebook não está configurado.", "not_configured", 0, false);
  },
  async refreshAccessToken() {
    throw new MetaApiError("Facebook não está configurado.", "not_configured", 0, false);
  },
  async getProfile() {
    throw new MetaApiError("Facebook não está configurado.", "not_configured", 0, false);
  },
  async publishVideo() {
    throw new MetaApiError("Facebook não está configurado.", "not_configured", 0, false);
  },
  async getPostStatus() {
    throw new MetaApiError("Facebook não está configurado.", "not_configured", 0, false);
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
