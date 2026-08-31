import type { SocialPlatform } from "@/generated/prisma/client";

export type PlatformCapabilities = {
  canPublishVideo: boolean;
  canPublishImage: boolean;
  canSchedule: boolean;
  canReadFollowers: boolean;
  canReadViews: boolean;
  canReadLikes: boolean;
  canReadComments: boolean;
  canReadShares: boolean;
  canDeletePost: boolean;
  supportsPrivacy: boolean;
  supportsHashtags: boolean;
};

export const PLATFORM_CAPABILITIES: Record<SocialPlatform, PlatformCapabilities> = {
  TIKTOK: {
    canPublishVideo: true,
    canPublishImage: false,
    canSchedule: true,
    canReadFollowers: true,
    canReadViews: true,
    canReadLikes: true,
    canReadComments: true,
    canReadShares: true,
    canDeletePost: true,
    supportsPrivacy: true,
    supportsHashtags: true,
  },
  INSTAGRAM: {
    canPublishVideo: true,
    canPublishImage: true,
    canSchedule: true,
    canReadFollowers: true,
    canReadViews: true,
    canReadLikes: true,
    canReadComments: true,
    canReadShares: true,
    canDeletePost: true,
    supportsPrivacy: false,
    supportsHashtags: true,
  },
  FACEBOOK: {
    canPublishVideo: true,
    canPublishImage: true,
    canSchedule: true,
    canReadFollowers: true,
    canReadViews: true,
    canReadLikes: true,
    canReadComments: true,
    canReadShares: true,
    canDeletePost: true,
    supportsPrivacy: false,
    supportsHashtags: true,
  },
  X: {
    canPublishVideo: true,
    canPublishImage: true,
    canSchedule: true,
    canReadFollowers: true,
    canReadViews: true,
    canReadLikes: true,
    canReadComments: true,
    canReadShares: true,
    canDeletePost: true,
    supportsPrivacy: false,
    supportsHashtags: true,
  },
  LINKEDIN: {
    canPublishVideo: true,
    canPublishImage: true,
    canSchedule: true,
    canReadFollowers: true,
    canReadViews: true,
    canReadLikes: true,
    canReadComments: true,
    canReadShares: true,
    canDeletePost: true,
    supportsPrivacy: true,
    supportsHashtags: true,
  },
  BLUESKY: {
    canPublishVideo: true,
    canPublishImage: true,
    canSchedule: false,
    canReadFollowers: true,
    canReadViews: false,
    canReadLikes: true,
    canReadComments: true,
    canReadShares: true,
    canDeletePost: true,
    supportsPrivacy: false,
    supportsHashtags: true,
  },
  YOUTUBE: {
    canPublishVideo: true,
    canPublishImage: false,
    canSchedule: true,
    canReadFollowers: true,
    canReadViews: true,
    canReadLikes: true,
    canReadComments: true,
    canReadShares: false,
    canDeletePost: true,
    supportsPrivacy: true,
    supportsHashtags: true,
  },
  THREADS: {
    canPublishVideo: true,
    canPublishImage: true,
    canSchedule: false,
    canReadFollowers: true,
    canReadViews: true,
    canReadLikes: true,
    canReadComments: true,
    canReadShares: true,
    canDeletePost: true,
    supportsPrivacy: false,
    supportsHashtags: true,
  },
  PINTEREST: {
    canPublishVideo: true,
    canPublishImage: true,
    canSchedule: true,
    canReadFollowers: true,
    canReadViews: true,
    canReadLikes: false,
    canReadComments: false,
    canReadShares: true,
    canDeletePost: true,
    supportsPrivacy: false,
    supportsHashtags: true,
  },
  TWITCH: {
    canPublishVideo: false,
    canPublishImage: false,
    canSchedule: false,
    canReadFollowers: true,
    canReadViews: true,
    canReadLikes: false,
    canReadComments: false,
    canReadShares: false,
    canDeletePost: false,
    supportsPrivacy: false,
    supportsHashtags: false,
  },
  KICK: {
    canPublishVideo: false,
    canPublishImage: false,
    canSchedule: false,
    canReadFollowers: true,
    canReadViews: true,
    canReadLikes: false,
    canReadComments: false,
    canReadShares: false,
    canDeletePost: false,
    supportsPrivacy: false,
    supportsHashtags: false,
  },
  REDDIT: {
    canPublishVideo: true,
    canPublishImage: true,
    canSchedule: true,
    canReadFollowers: true,
    canReadViews: true,
    canReadLikes: true,
    canReadComments: true,
    canReadShares: false,
    canDeletePost: true,
    supportsPrivacy: false,
    supportsHashtags: true,
  },
};

export type SocialProfile = {
  externalAccountId: string;
  username: string;
  displayName: string;
  avatarUrl?: string;
};

export type SocialTokenResult = {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
  refreshExpiresAt?: Date;
  scopes: string[];
  profile: SocialProfile;
  providerMeta?: Record<string, unknown>;
};

export type SocialCreatorInfo = {
  username: string;
  nickname: string;
  avatarUrl?: string;
  privacyLevelOptions: string[];
  commentDisabled: boolean;
  duetDisabled: boolean;
  stitchDisabled: boolean;
  maxVideoPostDurationSec: number;
};

export type SocialPublishParams = {
  accessToken?: string;
  videoPath?: string;
  videoSize?: number;
  videoUrl?: string;
  title?: string;
  privacyLevel?: string;
  disableComment?: boolean;
  disableDuet?: boolean;
  disableStitch?: boolean;
  coverTimestampMs?: number;
  pageId?: string;
  igUserId?: string;
  shareToFeed?: boolean;
  description?: string;
  tags?: string[];
  thumbnailPath?: string;
  onProgress?: (ratio: number) => void;
};

export type SocialMetrics = {
  followers: number | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  posts: number | null;
  available: {
    followers: boolean;
    views: boolean;
    likes: boolean;
    comments: boolean;
    shares: boolean;
    posts: boolean;
  };
  raw?: unknown;
};

export interface SocialProvider {
  platform: SocialPlatform;
  mocked: boolean;
  configured?: boolean;
  getAuthorizationUrl(params: { state: string; codeChallenge?: string; redirectUri: string }): string;
  handleCallback(params: { code: string; redirectUri: string; codeVerifier?: string }): Promise<SocialTokenResult>;
  exchangeCode?(params: { code: string; redirectUri: string; codeVerifier?: string }): Promise<SocialTokenResult>;
  refreshAccessToken(refreshToken: string): Promise<{
    accessToken: string;
    refreshToken?: string;
    expiresAt?: Date;
    refreshExpiresAt?: Date;
    scopes?: string[];
  }>;
  revokeAccess?(accessToken: string): Promise<void>;
  getProfile(accessToken: string): Promise<SocialProfile>;
  getCreatorInfo?(accessToken: string): Promise<SocialCreatorInfo>;
  initializeVideoPost?(params: SocialPublishParams): Promise<{
    publishId: string;
    uploadUrl: string;
    chunkSize: number;
    totalChunkCount: number;
  }>;
  uploadVideo?(params: {
    accessToken?: string;
    filePath: string;
    uploadUrl: string;
    videoSize: number;
    chunkSize: number;
    totalChunkCount: number;
    onProgress?: (ratio: number) => void;
  }): Promise<void>;
  publishVideo(params?: SocialPublishParams): Promise<{
    externalPostId?: string;
    publishId?: string;
    mocked: boolean;
  }>;
  getPostStatus(params?: { accessToken?: string; publishId?: string }): Promise<{
    status: string;
    failReason?: string;
    postIds?: string[];
  }>;
  getMetrics(params?: { accessToken?: string; pageId?: string; igUserId?: string }): Promise<SocialMetrics>;
  disconnect(params?: { accessToken?: string }): Promise<void>;
}
