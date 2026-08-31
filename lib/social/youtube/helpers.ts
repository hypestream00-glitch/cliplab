export function youtubePublishLockKey(targetId: string, clipId: string, accountId: string) {
  return `youtube:${targetId}:${clipId}:${accountId}`;
}

export function composeYouTubeTitle(title: string) {
  return title.trim().slice(0, 100) || "Clipe CLIPLAB";
}

export function composeYouTubeDescription(caption: string, hashtags: string[]) {
  const tags = hashtags.map((tag) => `#${tag.replace(/^#/, "")}`).join(" ");
  return `${caption.trim()}\n\n${tags}`.trim().slice(0, 5000);
}

export type YouTubeProviderMeta = {
  channelId?: string;
  handle?: string;
  customUrl?: string;
};
