import type { SocialPlatform } from "@/generated/prisma/client";
import type { LiveMetadata, LivePlatformProvider, LiveStatusResult } from "@/lib/platforms/live";
import { youtubeApiKeyFromEnv } from "@/lib/trending/providers";
import { YOUTUBE_API_BASE } from "@/lib/social/youtube/config";
import { isTwitchOAuthConfigured, twitchClientId, twitchClientSecret } from "@/lib/social/twitch/config";
import { isKickConfigured, KICK_API_BASE, kickClientId, kickClientSecret } from "@/lib/social/kick/config";
import { kickAppToken } from "@/lib/social/kick/provider";

async function twitchAppToken() {
  const clientId = twitchClientId();
  const clientSecret = twitchClientSecret();
  if (!clientId || !clientSecret) return null;
  const response = await fetch("https://id.twitch.tv/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "client_credentials",
    }).toString(),
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) return null;
  const body = (await response.json()) as { access_token?: string };
  if (!body.access_token) return null;
  return { clientId, token: body.access_token };
}

export const twitchLiveProvider: LivePlatformProvider = {
  platform: "TWITCH",
  async getChannel(username) {
    return { username: username.replace(/^@/, "").trim() };
  },
  async getLiveStatus(username) {
    const login = username.replace(/^@/, "").trim().toLowerCase();
    const auth = await twitchAppToken();
    if (!auth) {
      return { status: isTwitchOAuthConfigured() ? "ERROR" : "OFFLINE", reason: "TWITCH_CLIENT_ID/SECRET ausentes" };
    }
    const url = new URL("https://api.twitch.tv/helix/streams");
    url.searchParams.set("user_login", login);
    const response = await fetch(url, {
      headers: { "Client-Id": auth.clientId, Authorization: `Bearer ${auth.token}` },
      signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) return { status: "ERROR", reason: `twitch-http-${response.status}` };
    const body = (await response.json()) as {
      data?: Array<{ title?: string; viewer_count?: number; started_at?: string; game_name?: string; thumbnail_url?: string; user_name?: string }>;
    };
    const row = body.data?.[0];
    if (!row) return { status: "OFFLINE", metadata: { platform: "TWITCH", username: login } };
    return {
      status: "LIVE",
      metadata: {
        platform: "TWITCH",
        username: row.user_name || login,
        title: row.title ?? null,
        category: row.game_name ?? null,
        viewers: typeof row.viewer_count === "number" ? row.viewer_count : null,
        startedAt: row.started_at ? new Date(row.started_at) : null,
        thumbnailUrl: row.thumbnail_url ? row.thumbnail_url.replace("{width}", "640").replace("{height}", "360") : null,
        canonicalUrl: `https://www.twitch.tv/${login}`,
      },
    };
  },
  async getLiveMetadata(username) {
    const result = await this.getLiveStatus(username);
    return result.metadata ?? null;
  },
};

export const youtubeLiveProvider: LivePlatformProvider = {
  platform: "YOUTUBE",
  async getChannel(username) {
    return { username: username.replace(/^@/, "").trim() };
  },
  async getLiveStatus(username) {
    const key = youtubeApiKeyFromEnv();
    if (!key) return { status: "OFFLINE", reason: "YOUTUBE_API_KEY ausente" };
    const handle = username.replace(/^@/, "").trim();
    const channelUrl = new URL(`${YOUTUBE_API_BASE}/channels`);
    channelUrl.searchParams.set("part", "id,snippet");
    channelUrl.searchParams.set("key", key);
    if (handle.includes("UC") && handle.length >= 20) channelUrl.searchParams.set("id", handle);
    else channelUrl.searchParams.set("forHandle", handle);
    const channelRes = await fetch(channelUrl, { signal: AbortSignal.timeout(12_000) });
    if (channelRes.status === 429) return { status: "ERROR", reason: "rate-limited" };
    if (!channelRes.ok) return { status: "ERROR", reason: `youtube-http-${channelRes.status}` };
    const channelJson = (await channelRes.json()) as { items?: Array<{ id?: string; snippet?: { title?: string } }> };
    const channelId = channelJson.items?.[0]?.id;
    if (!channelId) return { status: "OFFLINE", metadata: { platform: "YOUTUBE", username: handle } };
    const searchUrl = new URL(`${YOUTUBE_API_BASE}/search`);
    searchUrl.searchParams.set("part", "snippet");
    searchUrl.searchParams.set("channelId", channelId);
    searchUrl.searchParams.set("eventType", "live");
    searchUrl.searchParams.set("type", "video");
    searchUrl.searchParams.set("maxResults", "1");
    searchUrl.searchParams.set("key", key);
    const searchRes = await fetch(searchUrl, { signal: AbortSignal.timeout(12_000) });
    if (searchRes.status === 429) return { status: "ERROR", reason: "rate-limited" };
    if (!searchRes.ok) return { status: "ERROR", reason: `youtube-http-${searchRes.status}` };
    const searchJson = (await searchRes.json()) as {
      items?: Array<{ id?: { videoId?: string }; snippet?: { title?: string; thumbnails?: { high?: { url?: string } }; liveBroadcastContent?: string } }>;
    };
    const live = searchJson.items?.[0];
    if (!live?.id?.videoId) return { status: "OFFLINE", metadata: { platform: "YOUTUBE", username: handle } };
    return {
      status: "LIVE",
      metadata: {
        platform: "YOUTUBE",
        username: handle,
        title: live.snippet?.title ?? null,
        thumbnailUrl: live.snippet?.thumbnails?.high?.url ?? null,
        canonicalUrl: `https://www.youtube.com/watch?v=${live.id.videoId}`,
        viewers: null,
      },
    };
  },
  async getLiveMetadata(username) {
    const result = await this.getLiveStatus(username);
    return result.metadata ?? null;
  },
};

export const kickLiveProvider: LivePlatformProvider = {
  platform: "KICK",
  async getChannel(username) {
    return { username: username.replace(/^@/, "").trim() };
  },
  async getLiveStatus(username) {
    const slug = username.replace(/^@/, "").trim();
    if (!isKickConfigured()) return { status: "OFFLINE", reason: "KICK_CLIENT_ID/SECRET ausentes" };
    const auth = await kickAppToken({ clientId: kickClientId(), clientSecret: kickClientSecret() });
    if (!auth) return { status: "ERROR", reason: "kick-token-missing" };
    const url = new URL(`${KICK_API_BASE}/channels`);
    url.searchParams.set("slug", slug);
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${auth.token}` },
      signal: AbortSignal.timeout(12_000),
    });
    if (response.status === 429) return { status: "ERROR", reason: "rate-limited" };
    if (!response.ok) return { status: "ERROR", reason: `kick-http-${response.status}` };
    const json = (await response.json()) as {
      data?: Array<{
        slug?: string;
        stream_title?: string;
        category?: { name?: string };
        stream?: { is_live?: boolean; viewer_count?: number; start_time?: string; thumbnail?: string };
      }>;
    };
    const row = json.data?.[0];
    if (!row?.stream?.is_live) {
      return { status: "OFFLINE", metadata: { platform: "KICK", username: slug } };
    }
    const viewers = typeof row.stream.viewer_count === "number" ? row.stream.viewer_count : null;
    return {
      status: "LIVE",
      metadata: {
        platform: "KICK",
        username: row.slug || slug,
        title: row.stream_title ?? null,
        category: row.category?.name ?? null,
        viewers,
        startedAt: row.stream.start_time ? new Date(row.stream.start_time) : null,
        thumbnailUrl: row.stream.thumbnail ?? null,
        canonicalUrl: `https://kick.com/${row.slug || slug}`,
      },
    };
  },
  async getLiveMetadata(username) {
    const result = await this.getLiveStatus(username);
    return result.metadata ?? null;
  },
};

const REGISTRY: Partial<Record<SocialPlatform, LivePlatformProvider>> = {
  TWITCH: twitchLiveProvider,
  YOUTUBE: youtubeLiveProvider,
  KICK: kickLiveProvider,
};

export function getLivePlatformProvider(platform: SocialPlatform): LivePlatformProvider | null {
  return REGISTRY[platform] ?? null;
}

export function liveStatusToChannelStatus(status: LiveStatusResult["status"]): "LIVE" | "OFFLINE" | "ERROR" {
  if (status === "LIVE") return "LIVE";
  if (status === "ERROR") return "ERROR";
  return "OFFLINE";
}

export type { LiveMetadata };
