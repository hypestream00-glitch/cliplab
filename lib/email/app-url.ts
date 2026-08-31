function fallbackOrigin() {
  return "http://localhost:3000";
}

export function appOrigin() {
  const raw = (process.env.APP_URL ?? process.env.AUTH_URL ?? fallbackOrigin()).trim().replace(/\/$/, "");
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") return fallbackOrigin();
    if (url.username || url.password) return fallbackOrigin();
    return url.origin;
  } catch {
    return fallbackOrigin();
  }
}

export function appPathUrl(path: string) {
  const safe = path.startsWith("/") && !path.startsWith("//") ? path : "/";
  return `${appOrigin()}${safe}`;
}

export function isSafeAppPath(path: string) {
  return path.startsWith("/") && !path.startsWith("//") && !path.includes("\\");
}
