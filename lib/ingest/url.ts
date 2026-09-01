export const VIDEO_EXT = /\.(mp4|mov|webm)(?:$|[?#])/i;

export function hostOf(url: URL) {
  return url.hostname.replace(/^www\./, "").toLowerCase();
}

export function parseIngestUrl(raw: string): URL {
  const trimmed = raw.trim();
  if (!trimmed) throw new Error("invalid");
  return new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`);
}

export function looksLikeDirectVideoFile(url: URL) {
  return VIDEO_EXT.test(url.pathname) || VIDEO_EXT.test(url.toString());
}

export function filenameFromIngestUrl(url: string) {
  try {
    const name = decodeURIComponent(new URL(url).pathname.split("/").filter(Boolean).at(-1) ?? "video.mp4");
    return name.slice(0, 80) || "video.mp4";
  } catch {
    return "video.mp4";
  }
}

export function sanitizeIngestUrlForLog(raw: string) {
  try {
    const url = new URL(raw);
    url.username = "";
    url.password = "";
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return "[invalid-url]";
  }
}
