const DEFAULT_ALLOWED = ["http://localhost:3000", "http://127.0.0.1:3000"];

function publicOriginVariants(origin: string) {
  const trimmed = origin.replace(/\/$/, "");
  if (!trimmed) return [];
  try {
    const url = new URL(trimmed);
    const host = url.hostname.toLowerCase();
    if (host === "cortaclip.com") {
      return [`${url.protocol}//cortaclip.com`, `${url.protocol}//www.cortaclip.com`];
    }
    if (host === "www.cortaclip.com") {
      return [`${url.protocol}//www.cortaclip.com`, `${url.protocol}//cortaclip.com`];
    }
    return [url.origin];
  } catch {
    return [trimmed];
  }
}

export function allowedOrigins(source: NodeJS.ProcessEnv = process.env) {
  const extra = (source.CORS_ORIGINS ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const auth = (source.AUTH_URL ?? source.APP_URL ?? "").replace(/\/$/, "");
  const defaults = source.NODE_ENV === "production" ? [] : DEFAULT_ALLOWED;
  return [...new Set([...defaults, ...extra, ...publicOriginVariants(auth)].filter(Boolean))];
}

export function corsOriginFor(requestOrigin: string | null) {
  if (!requestOrigin) return null;
  const allowed = allowedOrigins();
  if (allowed.includes(requestOrigin)) return requestOrigin;
  return null;
}

export function applyAuthenticatedCors(headers: Headers, requestOrigin: string | null) {
  const origin = corsOriginFor(requestOrigin);
  if (!origin) return headers;
  headers.set("Access-Control-Allow-Origin", origin);
  headers.set("Vary", "Origin");
  headers.set("Access-Control-Allow-Credentials", "true");
  return headers;
}
