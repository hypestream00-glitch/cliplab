import { IngestError, ingestErrorMessage } from "@/lib/ingest/errors";
import { assertSafeIngestUrl, assertSafeResolvedHost, type HostLookup } from "@/lib/security/ssrf";

export type SafeFetchOptions = {
  method?: string;
  headers?: Record<string, string>;
  timeoutMs?: number;
  maxRedirects?: number;
  lookup?: HostLookup;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
};

const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_MAX_REDIRECTS = 3;

function redirectUrl(current: URL, location: string | null) {
  if (!location) return null;
  try {
    return new URL(location, current);
  } catch {
    return null;
  }
}

export async function safeIngestFetch(raw: string, options: SafeFetchOptions = {}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxRedirects = options.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
  let current = raw;
  for (let hop = 0; hop <= maxRedirects; hop += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const onAbort = () => controller.abort();
    options.signal?.addEventListener("abort", onAbort);
    try {
      assertSafeIngestUrl(current);
      const parsed = new URL(current);
      await assertSafeResolvedHost(parsed.hostname, options.lookup);
      const response = await fetchImpl(current, {
        method: options.method ?? "GET",
        headers: options.headers,
        redirect: "manual",
        signal: controller.signal,
      });
      if (response.status >= 300 && response.status < 400) {
        const next = redirectUrl(parsed, response.headers.get("location"));
        if (!next) throw new IngestError(ingestErrorMessage("unavailable"), "unavailable");
        current = next.toString();
        continue;
      }
      return { response, finalUrl: current };
    } catch (error) {
      if (error instanceof IngestError) throw error;
      if (error instanceof Error && error.name === "AbortError") {
        throw new IngestError(ingestErrorMessage("timeout"), "timeout");
      }
      if (error instanceof Error && error.message.includes("URL de ingestão bloqueada")) {
        throw new IngestError(ingestErrorMessage("blocked"), "blocked");
      }
      throw new IngestError(ingestErrorMessage("unavailable"), "unavailable");
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", onAbort);
    }
  }
  throw new IngestError(ingestErrorMessage("redirects"), "redirects");
}
