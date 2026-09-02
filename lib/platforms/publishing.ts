import type { SocialPlatform } from "@/generated/prisma/client";

export type PublishStatus = "QUEUED" | "UPLOADING" | "PROCESSING" | "PUBLISHED" | "FAILED" | "NOT_SUPPORTED" | "REQUIRES_APPROVAL";

export type SocialPublishRequest = {
  accessToken?: string;
  title: string;
  description?: string;
  tags?: string[];
  videoPath?: string;
  videoSize?: number;
  coverPath?: string;
};

export type SocialPublishResult = {
  mocked: boolean;
  publishId?: string;
  externalPostId?: string;
  status: PublishStatus;
  reason?: string;
};

export interface SocialPublishingProvider {
  platform: SocialPlatform;
  publishVideo(request: SocialPublishRequest): Promise<SocialPublishResult>;
  getPublishStatus(params: { accessToken?: string; publishId?: string }): Promise<{ status: PublishStatus; failReason?: string }>;
}
