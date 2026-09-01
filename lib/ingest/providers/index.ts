import { directUrlProvider } from "@/lib/ingest/providers/direct";
import { googleDriveProvider } from "@/lib/ingest/providers/google-drive";
import { instagramProvider } from "@/lib/ingest/providers/instagram";
import { kickProvider } from "@/lib/ingest/providers/kick";
import { tiktokProvider } from "@/lib/ingest/providers/tiktok";
import { twitchProvider } from "@/lib/ingest/providers/twitch";
import { youtubeProvider } from "@/lib/ingest/providers/youtube";
import type { ClassifiedIngestUrl, IngestProvider, MediaImportProvider } from "@/lib/ingest/types";
import { parseIngestUrl } from "@/lib/ingest/url";

const PROVIDERS: MediaImportProvider[] = [
  youtubeProvider,
  twitchProvider,
  kickProvider,
  tiktokProvider,
  instagramProvider,
  googleDriveProvider,
  directUrlProvider,
];

const BY_ID = new Map(PROVIDERS.map((provider) => [provider.id, provider]));

export function listMediaImportProviders() {
  return PROVIDERS;
}

export function getMediaImportProvider(id: IngestProvider) {
  return BY_ID.get(id) ?? directUrlProvider;
}

export function detectIngestProvider(raw: string): ClassifiedIngestUrl | null {
  let url: URL;
  try {
    url = parseIngestUrl(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  for (const provider of PROVIDERS) {
    const classified = provider.detect(url);
    if (classified) return classified;
  }
  return null;
}
