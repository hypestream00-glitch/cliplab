import { detectIngestProvider } from "@/lib/ingest/providers";
import type { IngestProvider } from "@/lib/ingest/types";
import { parseIngestUrl } from "@/lib/ingest/url";

export type { IngestProvider, ClassifiedIngestUrl } from "@/lib/ingest/types";
export { parseIngestUrl };

export function classifyIngestUrl(raw: string) {
  return detectIngestProvider(raw);
}

export function providerLabel(provider: IngestProvider) {
  switch (provider) {
    case "YOUTUBE":
      return "YouTube";
    case "TWITCH":
      return "Twitch";
    case "KICK":
      return "Kick";
    case "TIKTOK":
      return "TikTok";
    case "INSTAGRAM":
      return "Instagram";
    case "BILIBILI":
      return "Bilibili";
    case "GOOGLE_DRIVE":
      return "Google Drive";
    default:
      return "Arquivo direto";
  }
}
