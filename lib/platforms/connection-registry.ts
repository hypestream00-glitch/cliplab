import type { SocialPlatform } from "@/generated/prisma/client";

export type NativeConnectionProvider =
  | "GOOGLE_NATIVE"
  | "TWITCH_NATIVE"
  | "KICK_NATIVE"
  | "BILIBILI_NATIVE"
  | "TIKTOK_NATIVE"
  | "META_NATIVE"
  | "X_NATIVE";

export type ConnectionProvider = NativeConnectionProvider | "UPLOAD_POST" | "NONE";

export type IntegrationHealth = "READY" | "NOT_CONFIGURED" | "AUTH_ERROR" | "DEGRADED" | "REQUIRES_APPROVAL" | "NOT_SUPPORTED";

type ConnectionSpec = {
  connectionProvider: ConnectionProvider;
  oauth: boolean;
  nativeStartPath: string | null;
  uploadPost: boolean;
};

const NATIVE_START = (platform: SocialPlatform) => `/api/social/oauth/start?platform=${platform}`;

export const PLATFORM_CONNECTION = {
  YOUTUBE: { connectionProvider: "GOOGLE_NATIVE", oauth: true, nativeStartPath: NATIVE_START("YOUTUBE"), uploadPost: false },
  TWITCH: { connectionProvider: "TWITCH_NATIVE", oauth: true, nativeStartPath: NATIVE_START("TWITCH"), uploadPost: false },
  KICK: { connectionProvider: "KICK_NATIVE", oauth: true, nativeStartPath: NATIVE_START("KICK"), uploadPost: false },
  BILIBILI: { connectionProvider: "BILIBILI_NATIVE", oauth: true, nativeStartPath: NATIVE_START("BILIBILI"), uploadPost: false },
  TIKTOK: { connectionProvider: "TIKTOK_NATIVE", oauth: true, nativeStartPath: NATIVE_START("TIKTOK"), uploadPost: true },
  INSTAGRAM: { connectionProvider: "META_NATIVE", oauth: true, nativeStartPath: NATIVE_START("INSTAGRAM"), uploadPost: true },
  FACEBOOK: { connectionProvider: "META_NATIVE", oauth: true, nativeStartPath: NATIVE_START("FACEBOOK"), uploadPost: true },
  X: { connectionProvider: "X_NATIVE", oauth: true, nativeStartPath: NATIVE_START("X"), uploadPost: true },
  LINKEDIN: { connectionProvider: "UPLOAD_POST", oauth: false, nativeStartPath: null, uploadPost: true },
  THREADS: { connectionProvider: "UPLOAD_POST", oauth: false, nativeStartPath: null, uploadPost: true },
  PINTEREST: { connectionProvider: "UPLOAD_POST", oauth: false, nativeStartPath: null, uploadPost: true },
  BLUESKY: { connectionProvider: "UPLOAD_POST", oauth: false, nativeStartPath: null, uploadPost: true },
  REDDIT: { connectionProvider: "UPLOAD_POST", oauth: false, nativeStartPath: null, uploadPost: true },
} as const satisfies Record<SocialPlatform, ConnectionSpec>;

export const NATIVE_OAUTH_PLATFORMS = ["YOUTUBE", "TWITCH", "KICK", "BILIBILI"] as const;

export function platformConnection(platform: SocialPlatform) {
  return PLATFORM_CONNECTION[platform];
}

export function nativeOAuthStartPath(platform: SocialPlatform) {
  return PLATFORM_CONNECTION[platform].nativeStartPath;
}

export function youtubeNeverUsesUploadPost() {
  return PLATFORM_CONNECTION.YOUTUBE.connectionProvider === "GOOGLE_NATIVE" && PLATFORM_CONNECTION.YOUTUBE.uploadPost === false;
}
