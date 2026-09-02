import type { SocialProvider, SocialProfile, SocialTokenResult } from "@/lib/social/provider";
import { SocialApiError } from "@/lib/social/errors";
import {
  TWITCH_AUTHORIZE_URL,
  TWITCH_HELIX_BASE,
  TWITCH_REVOKE_URL,
  TWITCH_TOKEN_URL,
  isTwitchOAuthConfigured,
  twitchClientId,
  twitchClientSecret,
  twitchRedirectUri,
  twitchScopes,
} from "@/lib/social/twitch/config";
import { backoffWithJitter, sleepMs } from "@/lib/platforms/rate-limit";

function formBody(data: Record<string, string>) {
  return new URLSearchParams(data).toString();
}

async function twitchFetch(url: string, init: RequestInit = {}, attempts = 3) {
  let lastError: Error | null = null;
  for (let i = 0; i < attempts; i++) {
    const response = await fetch(url, { ...init, signal: AbortSignal.timeout(15_000) });
    if (response.status === 429 || response.status >= 500) {
      lastError = new SocialApiError("Twitch indisponível.", response.status === 429 ? "rate_limited" : "unavailable", response.status, true);
      await sleepMs(backoffWithJitter(i));
      continue;
    }
    return response;
  }
  throw lastError ?? new SocialApiError("Twitch indisponível.", "unavailable", 0, true);
}

async function exchangeTwitchToken(params: Record<string, string>) {
  const response = await twitchFetch(TWITCH_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: formBody({
      client_id: twitchClientId(),
      client_secret: twitchClientSecret(),
      ...params,
    }),
  });
  const json = (await response.json().catch(() => ({}))) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string[];
    message?: string;
  };
  if (!response.ok || !json.access_token) {
    throw new SocialApiError(json.message || "Falha no OAuth Twitch.", "invalid_grant", response.status, false);
  }
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresAt: json.expires_in ? new Date(Date.now() + json.expires_in * 1000) : undefined,
    scopes: json.scope ?? twitchScopes(),
  };
}

async function fetchTwitchUser(accessToken: string): Promise<SocialProfile> {
  const response = await twitchFetch(`${TWITCH_HELIX_BASE}/users`, {
    headers: { "Client-Id": twitchClientId(), Authorization: `Bearer ${accessToken}` },
  });
  const json = (await response.json().catch(() => ({}))) as {
    data?: Array<{ id?: string; login?: string; display_name?: string; profile_image_url?: string }>;
  };
  const user = json.data?.[0];
  if (!response.ok || !user?.id) {
    throw new SocialApiError("Não foi possível ler o perfil Twitch.", "profile", response.status, false);
  }
  return {
    externalAccountId: user.id,
    username: user.login || user.id,
    displayName: user.display_name || user.login || "Twitch",
    avatarUrl: user.profile_image_url,
  };
}

const notSupportedPublish = () => {
  throw new SocialApiError("Publicação não é suportada pela API oficial da Twitch neste produto.", "not_supported", 0, false);
};

export const unconfiguredTwitchProvider: SocialProvider = {
  platform: "TWITCH",
  mocked: false,
  configured: false,
  getAuthorizationUrl() {
    throw new SocialApiError("Twitch não está configurado. Defina TWITCH_CLIENT_ID e TWITCH_CLIENT_SECRET.", "not_configured", 0, false);
  },
  async handleCallback() {
    throw new SocialApiError("Twitch não está configurado.", "not_configured", 0, false);
  },
  async refreshAccessToken() {
    throw new SocialApiError("Twitch não está configurado.", "not_configured", 0, false);
  },
  async getProfile() {
    throw new SocialApiError("Twitch não está configurado.", "not_configured", 0, false);
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

export const twitchOAuthProvider: SocialProvider = {
  platform: "TWITCH",
  mocked: false,
  configured: true,
  getAuthorizationUrl({ state, codeChallenge, redirectUri }) {
    if (!isTwitchOAuthConfigured()) throw new SocialApiError("Twitch não está configurado.", "not_configured", 0, false);
    const url = new URL(TWITCH_AUTHORIZE_URL);
    url.searchParams.set("client_id", twitchClientId());
    url.searchParams.set("redirect_uri", redirectUri || twitchRedirectUri());
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", twitchScopes().join(" "));
    url.searchParams.set("state", state);
    if (codeChallenge) {
      url.searchParams.set("code_challenge", codeChallenge);
      url.searchParams.set("code_challenge_method", "S256");
    }
    return url.toString();
  },
  async handleCallback({ code, redirectUri, codeVerifier }) {
    const tokens = await exchangeTwitchToken({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      ...(codeVerifier ? { code_verifier: codeVerifier } : {}),
    });
    const profile = await fetchTwitchUser(tokens.accessToken);
    return { ...tokens, profile } satisfies SocialTokenResult;
  },
  async refreshAccessToken(refreshToken) {
    const tokens = await exchangeTwitchToken({ grant_type: "refresh_token", refresh_token: refreshToken });
    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken ?? refreshToken,
      expiresAt: tokens.expiresAt,
      scopes: tokens.scopes,
    };
  },
  async revokeAccess(accessToken) {
    await twitchFetch(TWITCH_REVOKE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: formBody({ client_id: twitchClientId(), token: accessToken }),
    });
  },
  async getProfile(accessToken) {
    return fetchTwitchUser(accessToken);
  },
  async publishVideo() {
    notSupportedPublish();
    return { mocked: false };
  },
  async getPostStatus() {
    return { status: "NOT_SUPPORTED" };
  },
  async getMetrics() {
    return unconfiguredTwitchProvider.getMetrics();
  },
  async disconnect(params) {
    if (params?.accessToken) {
      try {
        await twitchOAuthProvider.revokeAccess?.(params.accessToken);
      } catch {
        /* ignore */
      }
    }
  },
};
