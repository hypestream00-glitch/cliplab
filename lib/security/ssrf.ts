import { lookup as dnsLookup } from "node:dns/promises";

const PRIVATE_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1", "[::1]"]);

export type HostLookup = (hostname: string) => Promise<string[]>;

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

function ipv6Blocked(ip: string) {
  const lower = ip.toLowerCase();
  if (lower === "::1" || lower === "0:0:0:0:0:0:0:1") return true;
  if (lower.startsWith("fe80:") || lower.startsWith("fc") || lower.startsWith("fd")) return true;
  if (lower.startsWith("::ffff:")) return ipv4Private(lower.replace(/^::ffff:/, ""));
  return false;
}

export function isBlockedIp(ip: string) {
  const value = ip.replace(/^\[|\]$/g, "").toLowerCase();
  if (PRIVATE_HOSTS.has(value) || ipv4Private(value) || ipv6Blocked(value)) return true;
  if (value.startsWith("169.254.")) return true;
  return false;
}

export function isBlockedHostname(host: string) {
  const hostname = host.replace(/^\[|\]$/g, "").toLowerCase();
  if (PRIVATE_HOSTS.has(hostname) || hostname.endsWith(".local") || hostname.endsWith(".internal")) return true;
  if (hostname === "metadata.google.internal" || hostname.startsWith("169.254.")) return true;
  if (ipv4Private(hostname)) return true;
  if (hostname.includes(":")) return true;
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
  return isBlockedHostname(parsed.hostname);
}

export function assertSafeIngestUrl(raw: string) {
  if (isBlockedIngestUrl(raw)) {
    throw new Error("URL de ingestão bloqueada.");
  }
}

export async function defaultHostLookup(hostname: string): Promise<string[]> {
  const result = await dnsLookup(hostname, { all: true, verbatim: true });
  return result.map((item) => item.address);
}

export async function assertSafeResolvedHost(hostname: string, lookup: HostLookup = defaultHostLookup) {
  if (isBlockedHostname(hostname)) {
    throw new Error("URL de ingestão bloqueada.");
  }
  const addresses = await lookup(hostname);
  if (!addresses.length || addresses.some((ip) => isBlockedIp(ip))) {
    throw new Error("URL de ingestão bloqueada.");
  }
  return addresses;
}
