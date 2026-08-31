/** Official TikTok platform limits (Content Posting API + Login Kit, Aug 2026). */
export const PLATFORM_LIMITS = {
  TIKTOK: {
    captionMaxChars: 2200,
    maxHashtags: 30,
    maxFileBytes: 4 * 1024 * 1024 * 1024,
    minWidth: 360,
    minHeight: 360,
    maxWidth: 4096,
    maxHeight: 4096,
    minFps: 23,
    maxFps: 60,
    maxInitDurationSec: 600,
    defaultMaxDurationSec: 180,
    supportedFormats: ["video/mp4", "video/quicktime", "video/webm"],
    supportedExt: [".mp4", ".mov", ".webm"],
    chunkMinBytes: 5 * 1024 * 1024,
    chunkMaxBytes: 64 * 1024 * 1024,
    lastChunkMaxBytes: 128 * 1024 * 1024,
    maxChunks: 1000,
    creatorInfoRpm: 20,
    statusFetchRpm: 30,
  },
  INSTAGRAM: {
    captionMaxChars: 2200,
    maxHashtags: 30,
    maxFileBytes: 300 * 1024 * 1024,
    minDurationSec: 3,
    maxDurationSec: 15 * 60,
    minFps: 23,
    maxFps: 60,
    maxWidth: 1920,
    recommendedAspect: "9:16",
    supportedExt: [".mp4", ".mov"],
    postsPerDay: 50,
    containersPerDay: 400,
  },
  FACEBOOK: {
    captionMaxChars: 8000,
    maxHashtags: 30,
    maxFileBytes: 1 * 1024 * 1024 * 1024,
    minDurationSec: 3,
    maxDurationSec: 90,
    minFps: 24,
    maxFps: 60,
    minWidth: 540,
    minHeight: 960,
    recommendedWidth: 1080,
    recommendedHeight: 1920,
    supportedExt: [".mp4"],
    postsPerDay: 30,
  },
  X: {
    captionMaxChars: 280,
    longPostMaxChars: 25_000,
    maxHashtags: 30,
    maxFileBytes: 512 * 1024 * 1024,
    maxDurationSec: 140,
    chunkBytes: 4 * 1024 * 1024,
    supportedExt: [".mp4", ".mov"],
  },
  YOUTUBE: {
    captionMaxChars: 5000,
    titleMaxChars: 100,
    descriptionMaxChars: 5000,
    maxHashtags: 30,
    maxTags: 30,
    maxFileBytes: 256 * 1024 * 1024 * 1024,
    minDurationSec: 1,
    chunkBytes: 8 * 1024 * 1024,
    supportedExt: [".mp4", ".mov"],
  },
} as const;

export function xCaptionLimit() {
  return process.env.X_LONG_POSTS?.trim() === "true" ? PLATFORM_LIMITS.X.longPostMaxChars : PLATFORM_LIMITS.X.captionMaxChars;
}

export function captionLimitForPlatforms(platforms: Array<keyof typeof PLATFORM_LIMITS | string>) {
  const limits = platforms
    .map((platform) => {
      if (platform === "X") return xCaptionLimit();
      return PLATFORM_LIMITS[platform as keyof typeof PLATFORM_LIMITS]?.captionMaxChars;
    })
    .filter((value) => typeof value === "number");
  return limits.length ? Math.min(...limits) : PLATFORM_LIMITS.TIKTOK.captionMaxChars;
}

export function hashtagLimitForPlatforms(platforms: Array<keyof typeof PLATFORM_LIMITS | string>) {
  const limits = platforms
    .map((platform) => PLATFORM_LIMITS[platform as keyof typeof PLATFORM_LIMITS]?.maxHashtags)
    .filter((value) => typeof value === "number");
  return limits.length ? Math.min(...limits) : PLATFORM_LIMITS.TIKTOK.maxHashtags;
}

export type PlatformLimitKey = keyof typeof PLATFORM_LIMITS;
