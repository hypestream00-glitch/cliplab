import type { SocialPlatform } from "@/generated/prisma/client";
import type { PublicationStatus } from "@/generated/prisma/client";

export type UnifiedPublishOptions = {
  caption?: string;
  title?: string;
  description?: string;
  scheduledAt?: Date;
  timezone?: string;
  asyncUpload?: boolean;
  externalId?: string;
  idempotencyKey?: string;
};

export type PlatformOverrides = {
  tiktok?: {
    privacy_level?: "PUBLIC_TO_EVERYONE" | "MUTUAL_FOLLOW_FRIENDS" | "FOLLOWER_OF_CREATOR" | "SELF_ONLY";
    disable_comment?: boolean;
    disable_duet?: boolean;
    disable_stitch?: boolean;
    tiktok_title?: string;
  };
  instagram?: {
    instagram_title?: string;
    share_to_feed?: boolean;
  };
  youtube?: {
    youtube_title?: string;
    youtube_description?: string;
    privacyStatus?: "public" | "unlisted" | "private";
    tags?: string[];
  };
  facebook?: { facebook_title?: string };
  x?: { x_title?: string };
  linkedin?: { linkedin_title?: string; visibility?: string };
  threads?: { threads_title?: string };
  pinterest?: { pinterest_title?: string };
  reddit?: { reddit_title?: string; subreddit?: string };
};

export type UnifiedConnectedAccount = {
  platform: SocialPlatform;
  externalAccountId: string;
  username: string;
  displayName: string;
  avatarUrl?: string | null;
};

export type UnifiedCapabilities = {
  platforms: SocialPlatform[];
  whiteLabel: boolean;
  scheduling: boolean;
  analytics: boolean;
  webhooks: boolean;
};

export type UnifiedSocialProvider = {
  id: "upload-post" | "native" | "mock";
  createUserProfile(workspaceId: string): Promise<{ username: string }>;
  deleteUserProfile(workspaceId: string): Promise<void>;
  generateConnectToken(workspaceId: string): Promise<{ accessUrl: string; duration: string }>;
  generateConnectUrl(workspaceId: string): Promise<string>;
  getConnectedAccounts(workspaceId: string): Promise<UnifiedConnectedAccount[]>;
  publish(workspaceId: string, publicationId: string): Promise<void>;
  schedule(workspaceId: string, publicationId: string): Promise<void>;
  getPublicationStatus(workspaceId: string, publicationId: string): Promise<PublicationStatus | null>;
  getAnalytics(workspaceId: string): Promise<void>;
  disconnectAccount(workspaceId: string, accountId: string, userId: string): Promise<void>;
  refreshProfile(workspaceId: string): Promise<void>;
  getCapabilities(): UnifiedCapabilities;
};
