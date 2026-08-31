import type { SocialProvider, SocialProfile, SocialTokenResult } from "@/lib/social/provider";
import {
  GOOGLE_AUTHORIZE_URL,
  GOOGLE_REVOKE_URL,
  GOOGLE_TOKEN_URL,
  YOUTUBE_API_BASE,
  isYouTubeConfigured,
  youtubeClientId,
  youtubeClientSecret,
  youtubeRedirectUri,
  youtubeScopes,
  youtubeUploadStatus,
} from "@/lib/social/youtube/config";
import { YouTubeApiError, mapYouTubeVideoStatus, parseYouTubeError, youtubeFetch } from "@/lib/social/youtube/http";
import { startYouTubeResumable, uploadYouTubeChunks } from "@/lib/social/youtube/upload";
import { logger } from "@/lib/logger";

function formBody(data: Record<string, string>) {
  return new URLSearchParams(data).toString();
}

async function readJson(response: Response) {
  return (await response.json().catch(() => ({}))) as Record<string, unknown>;
}

export const unconfiguredYouTubeProvider: SocialProvider = {
  platform: "YOUTUBE",
  mocked: false,
  configured: false,
  getAuthorizationUrl() {
    throw new YouTubeApiError("YouTube não está configurado. Defina GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET.", "not_configured", 0, false);
  },
  async handleCallback() {
    throw new YouTubeApiError("YouTube não está configurado.", "not_configured", 0, false);
  },
  async refreshAccessToken() {
    throw new YouTubeApiError("YouTube não está configurado.", "not_configured", 0, false);
  },
  async getProfile() {
    throw new YouTubeApiError("YouTube não está configurado.", "not_configured", 0, false);
  },
  async publishVideo() {
    throw new YouTubeApiError("YouTube não está configurado.", "not_configured", 0, false);
  },
  async getPostStatus() {
    throw new YouTubeApiError("YouTube não está configurado.", "not_configured", 0, false);
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

async function exchangeGoogleToken(body: Record<string, string>): Promise<Omit<SocialTokenResult, "profile"> & { idToken?: string }> {
  const response = await youtubeFetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: formBody({ ...body, client_id: youtubeClientId(), client_secret: youtubeClientSecret() }),
  });
  const json = await readJson(response);
  if (!response.ok || json.error || !json.access_token) throw parseYouTubeError(json, response.status);
  const expiresIn = Number(json.expires_in ?? 3600);
  const scopes = String(json.scope ?? "")
    .split(/\s+/)
    .map((item) => item.trim())
    .filter(Boolean);
  return {
    accessToken: String(json.access_token),
    refreshToken: json.refresh_token ? String(json.refresh_token) : undefined,
    expiresAt: new Date(Date.now() + expiresIn * 1000),
    refreshExpiresAt: json.refresh_token ? new Date(Date.now() + 180 * 24 * 3600 * 1000) : undefined,
    scopes: scopes.length ? scopes : [...youtubeScopes()],
  };
}

export async function fetchYouTubeChannel(accessToken: string) {
  const url = new URL(`${YOUTUBE_API_BASE}/channels`);
  url.searchParams.set("part", "snippet,statistics,contentDetails");
  url.searchParams.set("mine", "true");
  const response = await youtubeFetch(url.toString(), { headers: { Authorization: `Bearer ${accessToken}` } });
  const json = await readJson(response);
  if (!response.ok) throw parseYouTubeError(json, response.status);
  const item = (json.items as Array<Record<string, unknown>> | undefined)?.[0];
  if (!item) throw new YouTubeApiError("Nenhum canal YouTube nesta conta Google.", "youtubeSignupRequired", 404, false);
  const snippet = (item.snippet ?? {}) as {
    title?: string;
    customUrl?: string;
    thumbnails?: { default?: { url?: string } };
  };
  const stats = (item.statistics ?? {}) as { subscriberCount?: string; viewCount?: string; videoCount?: string };
  const id = String(item.id ?? "");
  const handle = snippet.customUrl?.replace(/^@/, "");
  const profile: SocialProfile = {
    externalAccountId: id,
    username: handle || snippet.customUrl || id,
    displayName: snippet.title || "YouTube",
    avatarUrl: snippet.thumbnails?.default?.url,
  };
  return { profile, stats, handle, customUrl: snippet.customUrl, channelId: id };
}

export const youtubeProvider: SocialProvider = {
  platform: "YOUTUBE",
  mocked: false,
  configured: true,
  getAuthorizationUrl({ state, codeChallenge, redirectUri }) {
    if (!isYouTubeConfigured()) throw new YouTubeApiError("YouTube não está configurado.", "not_configured", 0, false);
    const url = new URL(GOOGLE_AUTHORIZE_URL);
    url.searchParams.set("client_id", youtubeClientId());
    url.searchParams.set("redirect_uri", redirectUri || youtubeRedirectUri());
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", youtubeScopes().join(" "));
    url.searchParams.set("state", state);
    url.searchParams.set("access_type", "offline");
    url.searchParams.set("prompt", "consent");
    url.searchParams.set("include_granted_scopes", "true");
    if (codeChallenge) {
      url.searchParams.set("code_challenge", codeChallenge);
      url.searchParams.set("code_challenge_method", "S256");
    }
    return url.toString();
  },
  async handleCallback({ code, redirectUri, codeVerifier }) {
    const tokens = await exchangeGoogleToken({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      ...(codeVerifier ? { code_verifier: codeVerifier } : {}),
    });
    const channel = await fetchYouTubeChannel(tokens.accessToken);
    return { ...tokens, profile: channel.profile, providerMeta: { channelId: channel.channelId, handle: channel.handle, customUrl: channel.customUrl } };
  },
  async exchangeCode(params) {
    return youtubeProvider.handleCallback(params);
  },
  async refreshAccessToken(refreshToken) {
    const tokens = await exchangeGoogleToken({ grant_type: "refresh_token", refresh_token: refreshToken });
    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken ?? refreshToken,
      expiresAt: tokens.expiresAt,
      refreshExpiresAt: tokens.refreshExpiresAt,
      scopes: tokens.scopes,
    };
  },
  async revokeAccess(accessToken) {
    await youtubeFetch(`${GOOGLE_REVOKE_URL}?token=${encodeURIComponent(accessToken)}`, { method: "POST" });
  },
  async getProfile(accessToken) {
    const channel = await fetchYouTubeChannel(accessToken);
    return channel.profile;
  },
  async initializeVideoPost(params) {
    if (youtubeUploadStatus() === "CONFIGURATION REQUIRED") {
      throw new YouTubeApiError("YouTube não está configurado.", "not_configured", 0, false);
    }
    if (!params?.accessToken || !params.videoSize || !params.title) {
      throw new YouTubeApiError("Parâmetros de upload YouTube incompletos.", "invalid_request", 400, false);
    }
    const uploadUrl = await startYouTubeResumable({
      accessToken: params.accessToken,
      videoSize: params.videoSize,
      title: params.title,
      description: params.description,
      tags: params.tags,
      privacy: params.privacyLevel,
    });
    return { publishId: uploadUrl, uploadUrl, chunkSize: 8 * 1024 * 1024, totalChunkCount: Math.ceil(params.videoSize / (8 * 1024 * 1024)) };
  },
  async uploadVideo(params) {
    await uploadYouTubeChunks({
      accessToken: params.accessToken ?? "",
      uploadUrl: params.uploadUrl,
      filePath: params.filePath,
      videoSize: params.videoSize,
      onProgress: params.onProgress,
    });
  },
  async publishVideo(params) {
    if (!params?.accessToken || !params.videoPath || !params.videoSize) {
      throw new YouTubeApiError("Parâmetros de publicação YouTube incompletos.", "invalid_request", 400, false);
    }
    const init = await youtubeProvider.initializeVideoPost!(params);
    const videoId = await uploadYouTubeChunks({
      accessToken: params.accessToken,
      uploadUrl: init.uploadUrl,
      filePath: params.videoPath,
      videoSize: params.videoSize,
      onProgress: params.onProgress,
    });
    return { publishId: videoId, externalPostId: videoId, mocked: false as const };
  },
  async getPostStatus(params) {
    if (!params?.accessToken || !params.publishId) {
      throw new YouTubeApiError("videoId ausente.", "invalid_request", 400, false);
    }
    const url = new URL(`${YOUTUBE_API_BASE}/videos`);
    url.searchParams.set("part", "status,processingDetails");
    url.searchParams.set("id", params.publishId);
    const response = await youtubeFetch(url.toString(), { headers: { Authorization: `Bearer ${params.accessToken}` } });
    const json = await readJson(response);
    if (!response.ok) throw parseYouTubeError(json, response.status);
    const item = (json.items as Array<{
      status?: { uploadStatus?: string; rejectionReason?: string; failureReason?: string };
      processingDetails?: { processingStatus?: string };
    }> | undefined)?.[0];
    if (!item) return { status: "PROCESSING" };
    const mapped = mapYouTubeVideoStatus({
      uploadStatus: item.status?.uploadStatus,
      processingStatus: item.processingDetails?.processingStatus,
      rejectionReason: item.status?.rejectionReason,
      failureReason: item.status?.failureReason,
    });
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
    if (!params?.accessToken) return empty;
    const channel = await fetchYouTubeChannel(params.accessToken).catch(() => null);
    if (!channel) return empty;
    const followers = channel.stats.subscriberCount != null ? Number(channel.stats.subscriberCount) : null;
    const views = channel.stats.viewCount != null ? Number(channel.stats.viewCount) : null;
    const posts = channel.stats.videoCount != null ? Number(channel.stats.videoCount) : null;
    return {
      followers,
      views,
      likes: null,
      comments: null,
      shares: null,
      posts,
      available: {
        followers: followers != null,
        views: views != null,
        likes: false,
        comments: false,
        shares: false,
        posts: posts != null,
      },
      raw: { statistics: channel.stats },
    };
  },
  async disconnect(params) {
    if (params?.accessToken) {
      try {
        await youtubeProvider.revokeAccess?.(params.accessToken);
      } catch (error) {
        logger.warn({ err: error }, "youtube revoke failed");
      }
    }
  },
};

export async function setYouTubeThumbnail(accessToken: string, videoId: string, filePath: string, size: number) {
  const { createReadStream } = await import("node:fs");
  const stream = createReadStream(filePath);
  const chunks: Buffer[] = [];
  for await (const piece of stream) chunks.push(Buffer.isBuffer(piece) ? piece : Buffer.from(piece));
  const body = Buffer.concat(chunks);
  void size;
  const url = `https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${encodeURIComponent(videoId)}`;
  const response = await youtubeFetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "image/jpeg",
    },
    body,
  });
  if (!response.ok) {
    logger.warn({ status: response.status }, "youtube thumbnail set skipped");
  }
}

export async function fetchYouTubeVideoStats(accessToken: string, videoId: string) {
  const url = new URL(`${YOUTUBE_API_BASE}/videos`);
  url.searchParams.set("part", "statistics,status");
  url.searchParams.set("id", videoId);
  const response = await youtubeFetch(url.toString(), { headers: { Authorization: `Bearer ${accessToken}` } });
  const json = await readJson(response);
  if (!response.ok) {
    return {
      views: null,
      likes: null,
      comments: null,
      available: { views: false, likes: false, comments: false, shares: false },
      raw: json,
    };
  }
  const item = (json.items as Array<{ statistics?: Record<string, string> }> | undefined)?.[0];
  const stats = item?.statistics ?? {};
  return {
    views: stats.viewCount != null ? Number(stats.viewCount) : null,
    likes: stats.likeCount != null ? Number(stats.likeCount) : null,
    comments: stats.commentCount != null ? Number(stats.commentCount) : null,
    available: {
      views: stats.viewCount != null,
      likes: stats.likeCount != null,
      comments: stats.commentCount != null,
      shares: false,
    },
    raw: json,
  };
}
