const PRIVATE_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1", "[::1]"]);

function ipv4Private(host: string) {
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!match) return false;
  const a = Number(match[1]);
  const b = Number(match[2]);
  if (a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return false;
}

export function isBlockedIngestUrl(raw: string) {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return true;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return true;
  const host = parsed.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (PRIVATE_HOSTS.has(host) || host.endsWith(".local") || host.endsWith(".internal")) return true;
  if (host === "metadata.google.internal" || host.startsWith("169.254.")) return true;
  if (ipv4Private(host)) return true;
  if (host.includes(":")) return true;
  return false;
}

export function assertSafeIngestUrl(raw: string) {
  if (isBlockedIngestUrl(raw)) {
    throw new Error("URL de ingestão bloqueada.");
  }
}
