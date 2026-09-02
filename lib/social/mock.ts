import type { SocialPlatform } from "@/generated/prisma/client";
import type { SocialProvider, SocialProfile } from "@/lib/social/provider";
import { randomToken } from "@/lib/security/crypto";

function mockProfile(platform: SocialPlatform): SocialProfile {
  const names: Record<SocialPlatform, string> = {
    TIKTOK: "studio.clips",
    INSTAGRAM: "studio.reels",
    FACEBOOK: "Studio Page",
    X: "studio_clips",
    LINKEDIN: "cliplab-studio",
    BLUESKY: "studio.bsky.social",
    YOUTUBE: "Studio Clips",
    THREADS: "studio.clips",
    PINTEREST: "studioclips",
    TWITCH: "studiolive",
    KICK: "studiolive",
    REDDIT: "studio_clips",
    BILIBILI: "studio.bilibili",
  };
  return {
    externalAccountId: `mock_${platform.toLowerCase()}`,
    username: names[platform],
    displayName: names[platform],
    avatarUrl: undefined,
  };
}

export function createMockSocialProvider(platform: SocialPlatform): SocialProvider {
  return {
    platform,
    mocked: true,
    getAuthorizationUrl({ state, redirectUri }) {
      const origin = redirectUri.replace(/\/$/, "");
      const url = new URL("/api/social/oauth/callback", origin.startsWith("http") ? origin : "http://localhost:3000");
      url.searchParams.set("state", state);
      url.searchParams.set("code", `dev_${platform}`);
      url.searchParams.set("platform", platform);
      return url.toString();
    },
    async handleCallback() {
      return {
        accessToken: randomToken(24),
        refreshToken: randomToken(24),
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30),
        scopes: ["mock"],
        profile: mockProfile(platform),
      };
    },
    async refreshAccessToken() {
      return { accessToken: randomToken(24), expiresAt: new Date(Date.now() + 86400000) };
    },
    async getProfile() {
      return mockProfile(platform);
    },
    async publishVideo() {
      return { externalPostId: `mock_post_${randomToken(8)}`, mocked: true };
    },
    async getPostStatus() {
      return { status: "MOCK_PUBLISHED" };
    },
    async getMetrics() {
      return {
        followers: null,
        views: null,
        likes: null,
        comments: null,
        shares: null,
        posts: null,
        available: {
          followers: false,
          views: false,
          likes: false,
          comments: false,
          shares: false,
          posts: false,
        },
        raw: { mock: true },
      };
    },
    async disconnect() {},
  };
}

export function getSocialProvider(platform: SocialPlatform): SocialProvider {
  return createMockSocialProvider(platform);
}

export function isSocialMocked() {
  return process.env.DEV_MOCK_PROVIDERS !== "false";
}
