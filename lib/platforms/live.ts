import type { SocialPlatform } from "@/generated/prisma/client";

export type LiveStatusKind = "LIVE" | "OFFLINE" | "ERROR" | "UNSUPPORTED";

export type LiveMetadata = {
  platform: SocialPlatform;
  username: string;
  title?: string | null;
  category?: string | null;
  viewers?: number | null;
  startedAt?: Date | null;
  thumbnailUrl?: string | null;
  canonicalUrl?: string | null;
};

export type LiveStatusResult = {
  status: LiveStatusKind;
  metadata?: LiveMetadata;
  reason?: string;
};

export interface LivePlatformProvider {
  platform: SocialPlatform;
  getChannel(username: string): Promise<{ username: string; channelId?: string } | null>;
  getLiveStatus(username: string): Promise<LiveStatusResult>;
  getLiveMetadata(username: string): Promise<LiveMetadata | null>;
}
