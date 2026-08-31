import type { SocialProvider, SocialProfile, SocialTokenResult } from "@/lib/social/provider";
import {
  TIKTOK_API_BASE,
  TIKTOK_AUTHORIZE_URL,
  TIKTOK_REVOKE_URL,
  TIKTOK_SCOPES,
  TIKTOK_TOKEN_URL,
  isTikTokConfigured,
  tiktokClientKey,
  tiktokClientSecret,
} from "@/lib/social/tiktok/config";
import { TikTokApiError, parseTikTokError, tiktokFetch, tiktokUserMessage } from "@/lib/social/tiktok/http";
import { mapTikTokPublishStatus, type TikTokCreatorInfo, type TikTokPostStatus } from "@/lib/social/tiktok/types";
import { planVideoChunks, uploadVideoChunks } from "@/lib/social/tiktok/upload";
import { logger } from "@/lib/logger";

function formBody(data: Record<string, string>) {
  return new URLSearchParams(data).toString();
}

async function readJson(response: Response) {
  return (await response.json().catch(() => ({}))) as Record<string, unknown>;
}

export const unconfiguredTikTokProvider: SocialProvider = {
  platform: "TIKTOK",
  mocked: false,
  configured: false,
  getAuthorizationUrl() {
    throw new TikTokApiError("TikTok não está configurado. Defina TIKTOK_CLIENT_KEY e TIKTOK_CLIENT_SECRET.", "not_configured", 0, false);
  },
  async handleCallback() {
    throw new TikTokApiError("TikTok não está configurado.", "not_configured", 0, false);
  },
  async refreshAccessToken() {
    throw new TikTokApiError("TikTok não está configurado.", "not_configured", 0, false);
  },
  async getProfile() {
    throw new TikTokApiError("TikTok não está configurado.", "not_configured", 0, false);
  },
  async publishVideo() {
    throw new TikTokApiError("TikTok não está configurado.", "not_configured", 0, false);
  },
  async getPostStatus() {
    throw new TikTokApiError("TikTok não está configurado.", "not_configured", 0, false);
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

async function exchangeToken(body: Record<string, string>): Promise<SocialTokenResult> {
  const response = await tiktokFetch(TIKTOK_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "Cache-Control": "no-cache" },
    body: formBody(body),
  });
  const json = await readJson(response);
  if (!response.ok || json.error || !json.access_token) {
    throw parseTikTokError(json, response.status);
  }
  const expiresIn = Number(json.expires_in ?? 86400);
  const refreshExpiresIn = Number(json.refresh_expires_in ?? 0);
  const openId = String(json.open_id ?? "");
  const scopes = String(json.scope ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  let profile: SocialProfile = {
    externalAccountId: openId || "unknown",
    username: openId.slice(0, 12) || "tiktok",
    displayName: openId.slice(0, 12) || "TikTok",
  };
  if (json.access_token && body.grant_type === "authorization_code") {
    try {
      profile = await fetchProfile(String(json.access_token), openId);
    } catch {
      profile.externalAccountId = openId || profile.externalAccountId;
    }
  } else if (openId) {
    profile.externalAccountId = openId;
  }
  return {
    accessToken: String(json.access_token),
    refreshToken: json.refresh_token ? String(json.refresh_token) : undefined,
    expiresAt: new Date(Date.now() + expiresIn * 1000),
    refreshExpiresAt: refreshExpiresIn ? new Date(Date.now() + refreshExpiresIn * 1000) : undefined,
    scopes,
    profile,
  };
}

async function fetchProfile(accessToken: string, fallbackOpenId = ""): Promise<SocialProfile> {
  const fields = "open_id,union_id,avatar_url,display_name,username";
  const response = await tiktokFetch(`${TIKTOK_API_BASE}/v2/user/info/?fields=${encodeURIComponent(fields)}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const json = await readJson(response);
  const error = (json.error as { code?: string; message?: string } | undefined) ?? {};
  if (!response.ok || (error.code && error.code !== "ok")) {
    throw parseTikTokError(json, response.status);
  }
  const user = ((json.data as { user?: Record<string, unknown> } | undefined)?.user ?? {}) as Record<string, unknown>;
  const openId = String(user.open_id ?? fallbackOpenId);
  if (!openId) throw new TikTokApiError("Perfil TikTok sem open_id.", "invalid_profile", 400, false);
  const username = String(user.username ?? user.display_name ?? openId.slice(0, 12));
  return {
    externalAccountId: openId,
    username,
    displayName: String(user.display_name ?? username),
    avatarUrl: user.avatar_url ? String(user.avatar_url) : undefined,
  };
}

async function creatorInfo(accessToken: string): Promise<TikTokCreatorInfo> {
  const response = await tiktokFetch(`${TIKTOK_API_BASE}/v2/post/publish/creator_info/query/`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json; charset=UTF-8",
    },
    body: "{}",
  });
  const json = await readJson(response);
  const error = (json.error as { code?: string; message?: string } | undefined) ?? {};
  if (!response.ok || (error.code && error.code !== "ok")) {
    throw parseTikTokError(json, response.status);
  }
  const data = (json.data ?? {}) as Record<string, unknown>;
  const options = Array.isArray(data.privacy_level_options)
    ? data.privacy_level_options.map((item) => String(item))
    : [];
  return {
    username: String(data.creator_username ?? ""),
    nickname: String(data.creator_nickname ?? ""),
    avatarUrl: data.creator_avatar_url ? String(data.creator_avatar_url) : undefined,
    privacyLevelOptions: options,
    commentDisabled: Boolean(data.comment_disabled),
    duetDisabled: Boolean(data.duet_disabled),
    stitchDisabled: Boolean(data.stitch_disabled),
    maxVideoPostDurationSec: Number(data.max_video_post_duration_sec ?? 180),
  };
}

async function fetchStatus(accessToken: string, publishId: string): Promise<TikTokPostStatus> {
  const response = await tiktokFetch(`${TIKTOK_API_BASE}/v2/post/publish/status/fetch/`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json; charset=UTF-8",
    },
    body: JSON.stringify({ publish_id: publishId }),
  });
  const json = await readJson(response);
  const error = (json.error as { code?: string; message?: string } | undefined) ?? {};
  if (!response.ok || (error.code && error.code !== "ok")) {
    throw parseTikTokError(json, response.status);
  }
  const data = (json.data ?? {}) as Record<string, unknown>;
  const postIds = Array.isArray(data.publicaly_available_post_id)
    ? data.publicaly_available_post_id.map((id) => String(id))
    : [];
  return {
    status: String(data.status ?? "PROCESSING_UPLOAD"),
    failReason: data.fail_reason ? String(data.fail_reason) : undefined,
    postIds,
    uploadedBytes: data.uploaded_bytes ? Number(data.uploaded_bytes) : undefined,
  };
}

export const tiktokProvider: SocialProvider = {
  platform: "TIKTOK",
  mocked: false,
  configured: true,
  getAuthorizationUrl({ state, redirectUri }) {
    if (!isTikTokConfigured()) {
      throw new TikTokApiError("TikTok não está configurado.", "not_configured", 0, false);
    }
    const url = new URL(TIKTOK_AUTHORIZE_URL);
    url.searchParams.set("client_key", tiktokClientKey());
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", TIKTOK_SCOPES.join(","));
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("state", state);
    url.searchParams.set("disable_auto_auth", "1");
    return url.toString();
  },
  async exchangeCode({ code, redirectUri }) {
    return exchangeToken({
      client_key: tiktokClientKey(),
      client_secret: tiktokClientSecret(),
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    });
  },
  async handleCallback({ code, redirectUri }) {
    return exchangeToken({
      client_key: tiktokClientKey(),
      client_secret: tiktokClientSecret(),
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    });
  },
  async refreshAccessToken(refreshToken) {
    const result = await exchangeToken({
      client_key: tiktokClientKey(),
      client_secret: tiktokClientSecret(),
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    });
    return {
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      expiresAt: result.expiresAt,
      refreshExpiresAt: result.refreshExpiresAt,
      scopes: result.scopes,
    };
  },
  async revokeAccess(accessToken) {
    const response = await tiktokFetch(TIKTOK_REVOKE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", "Cache-Control": "no-cache" },
      body: formBody({
        client_key: tiktokClientKey(),
        client_secret: tiktokClientSecret(),
        token: accessToken,
      }),
    });
    if (!response.ok) {
      const json = await readJson(response);
      logger.warn({ code: (json as { error?: string }).error }, "tiktok revoke failed");
    }
  },
  async getProfile(accessToken) {
    return fetchProfile(accessToken);
  },
  async getCreatorInfo(accessToken) {
    return creatorInfo(accessToken);
  },
  async initializeVideoPost(params) {
    if (!params?.accessToken || !params.videoSize || !params.title || !params.privacyLevel) {
      throw new TikTokApiError("Parâmetros de publicação TikTok incompletos.", "invalid_request", 400, false);
    }
    const chunks = planVideoChunks(params.videoSize);
    const initResponse = await tiktokFetch(`${TIKTOK_API_BASE}/v2/post/publish/video/init/`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${params.accessToken}`,
        "Content-Type": "application/json; charset=UTF-8",
      },
      body: JSON.stringify({
        post_info: {
          title: params.title,
          privacy_level: params.privacyLevel,
          disable_duet: Boolean(params.disableDuet),
          disable_comment: Boolean(params.disableComment),
          disable_stitch: Boolean(params.disableStitch),
          video_cover_timestamp_ms: params.coverTimestampMs ?? 1000,
        },
        source_info: {
          source: "FILE_UPLOAD",
          video_size: params.videoSize,
          chunk_size: chunks.chunkSize,
          total_chunk_count: chunks.totalChunkCount,
        },
      }),
    });
    const initJson = await readJson(initResponse);
    const error = (initJson.error as { code?: string; message?: string } | undefined) ?? {};
    if (!initResponse.ok || (error.code && error.code !== "ok")) {
      throw parseTikTokError(initJson, initResponse.status);
    }
    const data = (initJson.data ?? {}) as { publish_id?: string; upload_url?: string };
    if (!data.publish_id || !data.upload_url) {
      throw new TikTokApiError("TikTok não retornou publish_id/upload_url.", "invalid_response", 400, false);
    }
    return {
      publishId: data.publish_id,
      uploadUrl: data.upload_url,
      chunkSize: chunks.chunkSize,
      totalChunkCount: chunks.totalChunkCount,
    };
  },
  async uploadVideo(params) {
    await uploadVideoChunks({
      filePath: params.filePath,
      uploadUrl: params.uploadUrl,
      videoSize: params.videoSize,
      chunkSize: params.chunkSize,
      totalChunkCount: params.totalChunkCount,
      onProgress: (uploaded, total) => params.onProgress?.(uploaded / total),
    });
  },
  async publishVideo(params) {
    if (!params?.videoPath) {
      throw new TikTokApiError("Parâmetros de publicação TikTok incompletos.", "invalid_request", 400, false);
    }
    const init = await tiktokProvider.initializeVideoPost!(params);
    await tiktokProvider.uploadVideo!({
      filePath: params.videoPath,
      uploadUrl: init.uploadUrl,
      videoSize: params.videoSize!,
      chunkSize: init.chunkSize,
      totalChunkCount: init.totalChunkCount,
      onProgress: params.onProgress,
    });
    return { publishId: init.publishId, mocked: false as const };
  },
  async getPostStatus(params) {
    if (!params?.accessToken || !params.publishId) {
      throw new TikTokApiError("publish_id ausente.", "invalid_publish_id", 400, false);
    }
    const status = await fetchStatus(params.accessToken, params.publishId);
    return {
      status: mapTikTokPublishStatus(status.status),
      failReason: status.failReason ? tiktokUserMessage(status.failReason) : undefined,
      postIds: status.postIds,
    };
  },
  async getMetrics(params) {
    if (!params?.accessToken) {
      return {
        followers: null,
        views: null,
        likes: null,
        comments: null,
        shares: null,
        posts: null,
        available: { followers: false, views: false, likes: false, comments: false, shares: false, posts: false },
      };
    }
    const fields = "open_id,follower_count,likes_count,video_count";
    const userRes = await tiktokFetch(`${TIKTOK_API_BASE}/v2/user/info/?fields=${encodeURIComponent(fields)}`, {
      headers: { Authorization: `Bearer ${params.accessToken}` },
    });
    const userJson = await readJson(userRes);
    const userError = (userJson.error as { code?: string } | undefined)?.code;
    const statsOk = userRes.ok && (!userError || userError === "ok");
    const user = ((userJson.data as { user?: Record<string, unknown> } | undefined)?.user ?? {}) as Record<string, unknown>;
    const followers = statsOk && user.follower_count != null ? Number(user.follower_count) : null;
    const likes = statsOk && user.likes_count != null ? Number(user.likes_count) : null;
    const posts = statsOk && user.video_count != null ? Number(user.video_count) : null;

    let views: number | null = null;
    let comments: number | null = null;
    let shares: number | null = null;
    let videoRaw: unknown = null;
    const listRes = await tiktokFetch(`${TIKTOK_API_BASE}/v2/video/list/?fields=${encodeURIComponent("id,view_count,like_count,comment_count,share_count")}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${params.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ max_count: 20 }),
    });
    const listJson = await readJson(listRes);
    const listError = (listJson.error as { code?: string } | undefined)?.code;
    const listOk = listRes.ok && (!listError || listError === "ok");
    if (listOk) {
      videoRaw = listJson.data;
      const videos = ((listJson.data as { videos?: Array<Record<string, number>> } | undefined)?.videos ?? []);
      views = videos.reduce((sum, video) => sum + Number(video.view_count ?? 0), 0);
      comments = videos.reduce((sum, video) => sum + Number(video.comment_count ?? 0), 0);
      shares = videos.reduce((sum, video) => sum + Number(video.share_count ?? 0), 0);
    }
    return {
      followers,
      views,
      likes,
      comments,
      shares,
      posts,
      available: {
        followers: followers != null,
        views: listOk,
        likes: likes != null,
        comments: listOk,
        shares: listOk,
        posts: posts != null,
      },
      raw: { user: statsOk ? user : { error: userError }, videos: videoRaw },
    };
  },
  async disconnect(params) {
    if (params?.accessToken) {
      await tiktokProvider.revokeAccess?.(params.accessToken);
    }
  },
};

export { mapTikTokPublishStatus };
