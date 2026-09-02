import type { SocialProvider, SocialProfile, SocialTokenResult } from "@/lib/social/provider";
import { SocialApiError } from "@/lib/social/errors";
import {
  BILIBILI_AUTHORIZE_URL,
  BILIBILI_TOKEN_URL,
  BILIBILI_USER_INFO_URL,
  bilibiliClientId,
  bilibiliClientSecret,
  bilibiliRedirectUri,
  bilibiliSignedHeaders,
  isBilibiliConfigured,
  isBilibiliPublishingApproved,
} from "@/lib/social/bilibili/config";
import { backoffWithJitter, sleepMs } from "@/lib/platforms/rate-limit";

async function biliFetch(url: string, init: RequestInit = {}, attempts = 3) {
  let lastError: Error | null = null;
  for (let i = 0; i < attempts; i++) {
    const response = await fetch(url, { ...init, signal: AbortSignal.timeout(15_000) });
    if (response.status === 429 || response.status >= 500) {
      lastError = new SocialApiError("Bilibili indisponível.", response.status === 429 ? "rate_limited" : "unavailable", response.status, true);
      await sleepMs(backoffWithJitter(i));
      continue;
    }
    return response;
  }
  throw lastError ?? new SocialApiError("Bilibili indisponível.", "unavailable", 0, true);
}

type TokenData = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scopes?: string[];
};

function parseExpiresAt(expiresIn?: number) {
  if (!expiresIn || !Number.isFinite(expiresIn)) return undefined;
  if (expiresIn > 1_000_000_000) return new Date(expiresIn * 1000);
  return new Date(Date.now() + expiresIn * 1000);
}

async function exchangeBilibiliToken(params: Record<string, string>) {
  const url = new URL(BILIBILI_TOKEN_URL);
  for (const [key, value] of Object.entries({
    client_id: bilibiliClientId(),
    client_secret: bilibiliClientSecret(),
    ...params,
  })) {
    url.searchParams.set(key, value);
  }
  const response = await biliFetch(url.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  });
  const json = (await response.json().catch(() => ({}))) as { code?: number; message?: string; data?: TokenData };
  if (!response.ok || json.code !== 0 || !json.data?.access_token) {
    throw new SocialApiError(json.message || "Falha no OAuth Bilibili.", "invalid_grant", response.status, false);
  }
  return {
    accessToken: json.data.access_token,
    refreshToken: json.data.refresh_token,
    expiresAt: parseExpiresAt(json.data.expires_in),
    scopes: json.data.scopes ?? [],
  };
}

async function fetchBilibiliProfile(accessToken: string): Promise<SocialProfile> {
  const headers = bilibiliSignedHeaders({
    clientId: bilibiliClientId(),
    clientSecret: bilibiliClientSecret(),
    accessToken,
  });
  const response = await biliFetch(BILIBILI_USER_INFO_URL, { headers });
  const json = (await response.json().catch(() => ({}))) as {
    code?: number;
    message?: string;
    data?: { openid?: string; name?: string; face?: string; mid?: number | string };
  };
  const openid = json.data?.openid ?? (json.data?.mid != null ? String(json.data.mid) : "");
  if (!response.ok || json.code !== 0 || !openid) {
    throw new SocialApiError(json.message || "Não foi possível ler o perfil Bilibili.", "profile", response.status, false);
  }
  return {
    externalAccountId: openid,
    username: json.data?.name || openid,
    displayName: json.data?.name || "Bilibili",
    avatarUrl: json.data?.face,
  };
}

const publishBlocked = () => {
  if (!isBilibiliPublishingApproved()) {
    throw new SocialApiError("Publicação Bilibili aguarda aprovação da Open Platform.", "requires_approval", 0, false);
  }
  throw new SocialApiError("Upload Bilibili ainda não está habilitado neste ambiente.", "not_configured", 0, false);
};

export const unconfiguredBilibiliProvider: SocialProvider = {
  platform: "BILIBILI",
  mocked: false,
  configured: false,
  getAuthorizationUrl() {
    throw new SocialApiError("Bilibili não está configurado. Defina BILIBILI_CLIENT_ID e BILIBILI_CLIENT_SECRET.", "not_configured", 0, false);
  },
  async handleCallback() {
    throw new SocialApiError("Bilibili não está configurado.", "not_configured", 0, false);
  },
  async refreshAccessToken() {
    throw new SocialApiError("Bilibili não está configurado.", "not_configured", 0, false);
  },
  async getProfile() {
    throw new SocialApiError("Bilibili não está configurado.", "not_configured", 0, false);
  },
  async publishVideo() {
    publishBlocked();
    return { mocked: false };
  },
  async getPostStatus() {
    return { status: "NOT_SUPPORTED" };
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

export const bilibiliOAuthProvider: SocialProvider = {
  platform: "BILIBILI",
  mocked: false,
  configured: true,
  getAuthorizationUrl({ state, redirectUri }) {
    if (!isBilibiliConfigured()) throw new SocialApiError("Bilibili não está configurado.", "not_configured", 0, false);
    const url = new URL(BILIBILI_AUTHORIZE_URL);
    url.searchParams.set("client_id", bilibiliClientId());
    url.searchParams.set("gourl", redirectUri || bilibiliRedirectUri());
    url.searchParams.set("state", state);
    return url.toString();
  },
  async handleCallback({ code }) {
    const tokens = await exchangeBilibiliToken({ grant_type: "authorization_code", code });
    const profile = await fetchBilibiliProfile(tokens.accessToken);
    return { ...tokens, profile } satisfies SocialTokenResult;
  },
  async refreshAccessToken(refreshToken) {
    const tokens = await exchangeBilibiliToken({ grant_type: "refresh_token", refresh_token: refreshToken });
    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken ?? refreshToken,
      expiresAt: tokens.expiresAt,
      scopes: tokens.scopes,
    };
  },
  async getProfile(accessToken) {
    return fetchBilibiliProfile(accessToken);
  },
  async publishVideo() {
    publishBlocked();
    return { mocked: false };
  },
  async getPostStatus() {
    return { status: "REQUIRES_APPROVAL" };
  },
  async getMetrics() {
    return unconfiguredBilibiliProvider.getMetrics();
  },
  async disconnect() {},
};
