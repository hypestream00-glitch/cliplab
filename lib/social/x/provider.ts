import type { SocialProvider, SocialProfile, SocialTokenResult } from "@/lib/social/provider";
import {
  X_API_BASE,
  X_AUTHORIZE_URL,
  X_REVOKE_URL,
  X_SCOPES,
  X_TOKEN_URL,
  isXConfigured,
  xClientId,
  xClientSecret,
  xPublishingAllowed,
  xPublishingStatus,
  xRedirectUri,
} from "@/lib/social/x/config";
import { XApiError, parseXError, xFetch } from "@/lib/social/x/http";
import { xFinalizeMedia, xInitMediaUpload, xAppendMediaChunks, xMediaStatus } from "@/lib/social/x/upload";
import { logger } from "@/lib/logger";

function formBody(data: Record<string, string>) {
  return new URLSearchParams(data).toString();
}

function basicAuth() {
  return `Basic ${Buffer.from(`${xClientId()}:${xClientSecret()}`).toString("base64")}`;
}

async function readJson(response: Response) {
  return (await response.json().catch(() => ({}))) as Record<string, unknown>;
}

export const unconfiguredXProvider: SocialProvider = {
  platform: "X",
  mocked: false,
  configured: false,
  getAuthorizationUrl() {
    throw new XApiError("X não está configurado. Defina X_CLIENT_ID e X_CLIENT_SECRET.", "not_configured", 0, false);
  },
  async handleCallback() {
    throw new XApiError("X não está configurado.", "not_configured", 0, false);
  },
  async refreshAccessToken() {
    throw new XApiError("X não está configurado.", "not_configured", 0, false);
  },
  async getProfile() {
    throw new XApiError("X não está configurado.", "not_configured", 0, false);
  },
  async publishVideo() {
    throw new XApiError("X não está configurado.", "not_configured", 0, false);
  },
  async getPostStatus() {
    throw new XApiError("X não está configurado.", "not_configured", 0, false);
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
  const response = await xFetch(X_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: basicAuth(),
    },
    body: formBody(body),
  });
  const json = await readJson(response);
  if (!response.ok || json.error || !json.access_token) throw parseXError(json, response.status);
  const expiresIn = Number(json.expires_in ?? 7200);
  const scopes = String(json.scope ?? "")
    .split(/[,\s]+/)
    .map((item) => item.trim())
    .filter(Boolean);
  const profile = await fetchProfile(String(json.access_token));
  return {
    accessToken: String(json.access_token),
    refreshToken: json.refresh_token ? String(json.refresh_token) : undefined,
    expiresAt: new Date(Date.now() + expiresIn * 1000),
    refreshExpiresAt: json.refresh_token ? new Date(Date.now() + 180 * 24 * 3600 * 1000) : undefined,
    scopes: scopes.length ? scopes : [...X_SCOPES],
    profile,
  };
}

async function fetchProfile(accessToken: string): Promise<SocialProfile> {
  const url = new URL(`${X_API_BASE}/users/me`);
  url.searchParams.set("user.fields", "id,name,username,profile_image_url,public_metrics");
  const response = await xFetch(url.toString(), { headers: { Authorization: `Bearer ${accessToken}` } });
  const json = await readJson(response);
  if (!response.ok || json.errors || json.title) throw parseXError(json, response.status);
  const data = (json.data ?? {}) as {
    id?: string;
    name?: string;
    username?: string;
    profile_image_url?: string;
  };
  const id = String(data.id ?? "");
  if (!id) throw new XApiError("Perfil X sem id.", "invalid_profile", 400, false);
  return {
    externalAccountId: id,
    username: String(data.username ?? id),
    displayName: String(data.name ?? data.username ?? "X"),
    avatarUrl: data.profile_image_url,
  };
}

export const xProvider: SocialProvider = {
  platform: "X",
  mocked: false,
  configured: true,
  getAuthorizationUrl({ state, codeChallenge, redirectUri }) {
    if (!isXConfigured()) {
      throw new XApiError("X não está configurado.", "not_configured", 0, false);
    }
    if (!codeChallenge) {
      throw new XApiError("PKCE é obrigatório no OAuth 2.0 do X.", "invalid_request", 0, false);
    }
    const url = new URL(X_AUTHORIZE_URL);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", xClientId());
    url.searchParams.set("redirect_uri", redirectUri || xRedirectUri());
    url.searchParams.set("scope", X_SCOPES.join(" "));
    url.searchParams.set("state", state);
    url.searchParams.set("code_challenge", codeChallenge);
    url.searchParams.set("code_challenge_method", "S256");
    return url.toString();
  },
  async handleCallback({ code, redirectUri, codeVerifier }) {
    if (!codeVerifier) throw new XApiError("code_verifier PKCE ausente.", "invalid_request", 400, false);
    return exchangeToken({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      code_verifier: codeVerifier,
      client_id: xClientId(),
    });
  },
  async exchangeCode(params) {
    return xProvider.handleCallback(params);
  },
  async refreshAccessToken(refreshToken) {
    const result = await exchangeToken({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: xClientId(),
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
    await xFetch(X_REVOKE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: basicAuth(),
      },
      body: formBody({ token: accessToken, token_type_hint: "access_token", client_id: xClientId() }),
    });
  },
  async getProfile(accessToken) {
    return fetchProfile(accessToken);
  },
  async initializeVideoPost(params) {
    if (!xPublishingAllowed()) {
      throw new XApiError(
        xPublishingStatus() === "PLAN REQUIRED"
          ? "O plano da API do X não permite publicação. Use Basic, Pro ou Enterprise."
          : "Acesso de escrita da API do X ainda não está habilitado.",
        xPublishingStatus() === "PLAN REQUIRED" ? "plan_restriction" : "api_access_required",
        403,
        false,
      );
    }
    if (!params?.accessToken || !params.videoSize) {
      throw new XApiError("Parâmetros de upload X incompletos.", "invalid_request", 400, false);
    }
    const mediaId = await xInitMediaUpload(params.accessToken, params.videoSize);
    return { publishId: mediaId, uploadUrl: `${X_API_BASE}/media/upload`, chunkSize: 4 * 1024 * 1024, totalChunkCount: Math.ceil(params.videoSize / (4 * 1024 * 1024)) };
  },
  async uploadVideo(params) {
    const mediaId = new URL(params.uploadUrl).searchParams.get("media_id");
    void mediaId;
  },
  async publishVideo(params) {
    if (!xPublishingAllowed()) {
      throw new XApiError("Publicação no X indisponível para este app/tier.", "api_access_required", 403, false);
    }
    if (!params?.accessToken || !params.videoPath || !params.videoSize) {
      throw new XApiError("Parâmetros de publicação X incompletos.", "invalid_request", 400, false);
    }
    if (!params.accessToken) throw new XApiError("Token ausente.", "access_token_invalid", 401, false);
    const init = await xProvider.initializeVideoPost!(params);
    await xAppendMediaChunks({
      accessToken: params.accessToken,
      mediaId: init.publishId,
      filePath: params.videoPath,
      videoSize: params.videoSize,
      onProgress: params.onProgress,
    });
    await xFinalizeMedia(params.accessToken, init.publishId);
    return { publishId: init.publishId, mocked: false as const };
  },
  async getPostStatus(params) {
    if (!params?.accessToken || !params.publishId) {
      throw new XApiError("media_id ausente.", "invalid_request", 400, false);
    }
    if (params.publishId.startsWith("tweet:")) {
      return { status: "PUBLISHED", postIds: [params.publishId.slice("tweet:".length)] };
    }
    const status = await xMediaStatus(params.accessToken, params.publishId);
    return { status: status.status, failReason: status.error };
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
    const url = new URL(`${X_API_BASE}/users/me`);
    url.searchParams.set("user.fields", "public_metrics");
    const response = await xFetch(url.toString(), { headers: { Authorization: `Bearer ${params.accessToken}` } });
    const json = await readJson(response);
    if (!response.ok || json.errors || json.title) {
      return { ...empty, raw: { error: json.title ?? json.error } };
    }
    const metrics = ((json.data as { public_metrics?: Record<string, number> } | undefined)?.public_metrics) ?? {};
    const followers = metrics.followers_count != null ? Number(metrics.followers_count) : null;
    const posts = metrics.tweet_count != null ? Number(metrics.tweet_count) : null;
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
      raw: { public_metrics: metrics },
    };
  },
  async disconnect(params) {
    if (params?.accessToken) {
      try {
        await xProvider.revokeAccess?.(params.accessToken);
      } catch (error) {
        logger.warn({ err: error }, "x revoke failed");
      }
    }
  },
};

export async function createXPost(accessToken: string, text: string, mediaId: string) {
  const response = await xFetch(`${X_API_BASE}/tweets`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ text, media: { media_ids: [mediaId] } }),
  });
  const json = await readJson(response);
  if (!response.ok || json.errors || json.title || !(json.data as { id?: string } | undefined)?.id) {
    throw parseXError(json, response.status);
  }
  return String((json.data as { id: string }).id);
}

export async function fetchXTweetMetrics(accessToken: string, tweetId: string) {
  const url = new URL(`${X_API_BASE}/tweets/${encodeURIComponent(tweetId)}`);
  url.searchParams.set("tweet.fields", "public_metrics,organic_metrics");
  const response = await xFetch(url.toString(), { headers: { Authorization: `Bearer ${accessToken}` } });
  const json = await readJson(response);
  if (!response.ok) {
    return {
      likes: null,
      comments: null,
      shares: null,
      views: null,
      available: { likes: false, comments: false, shares: false, views: false },
      raw: json,
    };
  }
  const data = json.data as {
    public_metrics?: Record<string, number>;
    organic_metrics?: Record<string, number>;
  };
  const pub = data?.public_metrics ?? {};
  const organic = data?.organic_metrics ?? {};
  const impressions = organic.impression_count ?? pub.impression_count;
  return {
    likes: pub.like_count ?? null,
    comments: pub.reply_count ?? null,
    shares: pub.retweet_count ?? null,
    views: impressions ?? null,
    available: {
      likes: pub.like_count != null,
      comments: pub.reply_count != null,
      shares: pub.retweet_count != null,
      views: impressions != null,
    },
    raw: json,
  };
}
