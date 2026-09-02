import type { SocialProvider, SocialProfile, SocialTokenResult } from "@/lib/social/provider";
import { SocialApiError } from "@/lib/social/errors";
import {
  KICK_API_BASE,
  KICK_AUTHORIZE_URL,
  KICK_TOKEN_URL,
  isKickConfigured,
  kickClientId,
  kickClientSecret,
  kickRedirectUri,
  kickScopes,
} from "@/lib/social/kick/config";
import { backoffWithJitter, sleepMs } from "@/lib/platforms/rate-limit";

function formBody(data: Record<string, string>) {
  return new URLSearchParams(data).toString();
}

async function kickFetch(url: string, init: RequestInit = {}, attempts = 3) {
  let lastError: Error | null = null;
  for (let i = 0; i < attempts; i++) {
    const response = await fetch(url, { ...init, signal: AbortSignal.timeout(15_000) });
    if (response.status === 429 || response.status >= 500) {
      lastError = new SocialApiError("Kick indisponível.", response.status === 429 ? "rate_limited" : "unavailable", response.status, true);
      await sleepMs(backoffWithJitter(i));
      continue;
    }
    return response;
  }
  throw lastError ?? new SocialApiError("Kick indisponível.", "unavailable", 0, true);
}

async function exchangeKickToken(params: Record<string, string>) {
  const response = await kickFetch(KICK_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: formBody({
      client_id: kickClientId(),
      client_secret: kickClientSecret(),
      ...params,
    }),
  });
  const json = (await response.json().catch(() => ({}))) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
    message?: string;
  };
  if (!response.ok || !json.access_token) {
    throw new SocialApiError(json.message || "Falha no OAuth Kick.", "invalid_grant", response.status, false);
  }
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresAt: json.expires_in ? new Date(Date.now() + json.expires_in * 1000) : undefined,
    scopes: json.scope ? json.scope.split(/[ ,]+/).filter(Boolean) : kickScopes(),
  };
}

async function fetchKickUser(accessToken: string): Promise<SocialProfile> {
  const response = await kickFetch(`${KICK_API_BASE}/users`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const json = (await response.json().catch(() => ({}))) as {
    data?: Array<{ user_id?: number; id?: number; name?: string; username?: string; profile_picture?: string }> | {
      id?: number;
      name?: string;
      username?: string;
      profile_picture?: string;
    };
    message?: string;
  };
  const row = Array.isArray(json.data) ? json.data[0] : json.data;
  const id = row && ("user_id" in row ? row.user_id : row.id);
  if (!response.ok || id == null) {
    throw new SocialApiError(json.message || "Não foi possível ler o perfil Kick.", "profile", response.status, false);
  }
  const username = (row && ("name" in row ? row.name : undefined)) || (row && "username" in row ? row.username : undefined) || String(id);
  return {
    externalAccountId: String(id),
    username,
    displayName: username,
    avatarUrl: row && "profile_picture" in row ? row.profile_picture : undefined,
  };
}

const notSupportedPublish = () => {
  throw new SocialApiError("Publicação de clips não é suportada pela API oficial do Kick neste produto.", "not_supported", 0, false);
};

export const unconfiguredKickProvider: SocialProvider = {
  platform: "KICK",
  mocked: false,
  configured: false,
  getAuthorizationUrl() {
    throw new SocialApiError("Kick não está configurado. Defina KICK_CLIENT_ID e KICK_CLIENT_SECRET.", "not_configured", 0, false);
  },
  async handleCallback() {
    throw new SocialApiError("Kick não está configurado.", "not_configured", 0, false);
  },
  async refreshAccessToken() {
    throw new SocialApiError("Kick não está configurado.", "not_configured", 0, false);
  },
  async getProfile() {
    throw new SocialApiError("Kick não está configurado.", "not_configured", 0, false);
  },
  async publishVideo() {
    notSupportedPublish();
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

export const kickOAuthProvider: SocialProvider = {
  platform: "KICK",
  mocked: false,
  configured: true,
  getAuthorizationUrl({ state, codeChallenge, redirectUri }) {
    if (!isKickConfigured()) throw new SocialApiError("Kick não está configurado.", "not_configured", 0, false);
    if (!codeChallenge) throw new SocialApiError("Kick exige PKCE (S256).", "invalid_request", 0, false);
    const url = new URL(KICK_AUTHORIZE_URL);
    url.searchParams.set("client_id", kickClientId());
    url.searchParams.set("redirect_uri", redirectUri || kickRedirectUri());
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", kickScopes().join(" "));
    url.searchParams.set("state", state);
    url.searchParams.set("code_challenge", codeChallenge);
    url.searchParams.set("code_challenge_method", "S256");
    return url.toString();
  },
  async handleCallback({ code, redirectUri, codeVerifier }) {
    if (!codeVerifier) throw new SocialApiError("Kick exige code_verifier.", "invalid_request", 0, false);
    const tokens = await exchangeKickToken({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      code_verifier: codeVerifier,
    });
    const profile = await fetchKickUser(tokens.accessToken);
    return { ...tokens, profile } satisfies SocialTokenResult;
  },
  async refreshAccessToken(refreshToken) {
    const tokens = await exchangeKickToken({ grant_type: "refresh_token", refresh_token: refreshToken });
    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken ?? refreshToken,
      expiresAt: tokens.expiresAt,
      scopes: tokens.scopes,
    };
  },
  async getProfile(accessToken) {
    return fetchKickUser(accessToken);
  },
  async publishVideo() {
    notSupportedPublish();
    return { mocked: false };
  },
  async getPostStatus() {
    return { status: "NOT_SUPPORTED" };
  },
  async getMetrics() {
    return unconfiguredKickProvider.getMetrics();
  },
  async disconnect() {},
};

export async function kickAppToken(deps: { clientId?: string; clientSecret?: string; fetchImpl?: typeof fetch } = {}) {
  const clientId = deps.clientId?.trim() || kickClientId();
  const clientSecret = deps.clientSecret?.trim() || kickClientSecret();
  if (!clientId || !clientSecret) return null;
  const fetchImpl = deps.fetchImpl ?? fetch;
  const response = await fetchImpl(KICK_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: formBody({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "client_credentials",
    }),
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) return null;
  const json = (await response.json().catch(() => ({}))) as { access_token?: string };
  if (!json.access_token) return null;
  return { clientId, token: json.access_token };
}
