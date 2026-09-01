/** Raw verify/reset tokens are base64url. Email clients may wrap or percent-encode them. */
export function normalizeRawToken(raw: string) {
  const trimmed = raw.trim().replace(/\s+/g, "");
  if (!trimmed) return "";
  try {
    return decodeURIComponent(trimmed);
  } catch {
    return trimmed;
  }
}
