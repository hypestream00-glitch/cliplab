const DEFAULT_ALLOWED = ["http://localhost:3000", "http://127.0.0.1:3000"];

export function allowedOrigins() {
  const extra = (process.env.CORS_ORIGINS ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const auth = (process.env.AUTH_URL ?? "").replace(/\/$/, "");
  return [...new Set([...DEFAULT_ALLOWED, ...extra, auth].filter(Boolean))];
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
