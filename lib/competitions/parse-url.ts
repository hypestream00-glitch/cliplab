export type ParsedSocialPost = {
  platform: "TIKTOK" | "INSTAGRAM" | "YOUTUBE";
  postExternalId: string;
  postUrl: string;
} | null;

export function parseSocialPostUrl(raw: string): ParsedSocialPost {
  const value = raw.trim();
  if (!value) return null;
  let url: URL;
  try {
    url = new URL(value.startsWith("http") ? value : `https://${value}`);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^www\./, "").toLowerCase();
  if (host === "youtu.be") {
    const id = url.pathname.split("/").filter(Boolean)[0];
    return id ? { platform: "YOUTUBE", postExternalId: id, postUrl: `https://www.youtube.com/watch?v=${id}` } : null;
  }
  if (host === "youtube.com" || host.endsWith(".youtube.com")) {
    const id = url.searchParams.get("v") || url.pathname.split("/shorts/")[1]?.split("/")[0];
    return id ? { platform: "YOUTUBE", postExternalId: id, postUrl: `https://www.youtube.com/watch?v=${id}` } : null;
  }
  if (host === "tiktok.com" || host.endsWith(".tiktok.com")) {
    const match = url.pathname.match(/\/video\/(\d+)/);
    return match?.[1]
      ? { platform: "TIKTOK", postExternalId: match[1], postUrl: url.toString() }
      : null;
  }
  if (host === "instagram.com" || host.endsWith(".instagram.com")) {
    const parts = url.pathname.split("/").filter(Boolean);
    const idx = parts.findIndex((part) => part === "reel" || part === "p" || part === "tv");
    const code = idx >= 0 ? parts[idx + 1] : null;
    return code ? { platform: "INSTAGRAM", postExternalId: code, postUrl: url.toString() } : null;
  }
  return null;
}
