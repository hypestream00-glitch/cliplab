export type TikTokTokenSet = {
  accessToken: string;
  refreshToken?: string;
  expiresAt: Date;
  refreshExpiresAt?: Date;
  openId: string;
  scopes: string[];
};

export type TikTokCreatorInfo = {
  username: string;
  nickname: string;
  avatarUrl?: string;
  privacyLevelOptions: string[];
  commentDisabled: boolean;
  duetDisabled: boolean;
  stitchDisabled: boolean;
  maxVideoPostDurationSec: number;
};

export type TikTokPublishInput = {
  accessToken: string;
  videoPath: string;
  videoSize: number;
  title: string;
  privacyLevel: string;
  disableComment?: boolean;
  disableDuet?: boolean;
  disableStitch?: boolean;
  coverTimestampMs?: number;
  onProgress?: (ratio: number) => void;
};

export type TikTokPublishResult = {
  publishId: string;
  mocked: false;
};

export type TikTokPostStatus = {
  status: "PROCESSING_UPLOAD" | "PROCESSING_DOWNLOAD" | "SEND_TO_USER_INBOX" | "PUBLISH_COMPLETE" | "FAILED" | string;
  failReason?: string;
  postIds: string[];
  uploadedBytes?: number;
};

export function mapTikTokPublishStatus(status: string): "QUEUED" | "UPLOADING" | "PROCESSING" | "PUBLISHED" | "FAILED" {
  if (status === "PROCESSING_UPLOAD") return "UPLOADING";
  if (status === "PROCESSING_DOWNLOAD") return "PROCESSING";
  if (status === "SEND_TO_USER_INBOX") return "PROCESSING";
  if (status === "PUBLISH_COMPLETE") return "PUBLISHED";
  if (status === "FAILED") return "FAILED";
  return "PROCESSING";
}
