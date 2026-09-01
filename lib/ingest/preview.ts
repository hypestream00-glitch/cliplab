import { classifyIngestUrl, providerLabel } from "@/lib/ingest/classify";
import { IngestError, ingestErrorMessage } from "@/lib/ingest/errors";
import { getMediaImportProvider } from "@/lib/ingest/providers";
import { parseIsoDuration } from "@/lib/ingest/providers/youtube";
import type { IngestPreview, IngestPreviewAvailability, MediaImportContext } from "@/lib/ingest/types";

export type { IngestPreview, IngestPreviewAvailability } from "@/lib/ingest/types";
export type PreviewDeps = Pick<
  MediaImportContext,
  "lookup" | "fetchImpl" | "youtubeApiKey" | "twitchClientId" | "twitchClientSecret"
>;

export { parseIsoDuration };

function classifiedOrThrow(raw: string) {
  const classified = classifyIngestUrl(raw);
  if (!classified) throw new IngestError(ingestErrorMessage("invalid-url"), "invalid-url");
  return classified;
}

function availabilityFromPreview(preview: Pick<IngestPreview, "ingestSupported" | "title" | "thumbnailUrl" | "metadataSupported">): IngestPreviewAvailability {
  if (preview.ingestSupported) return "import-ready";
  if (preview.title || preview.thumbnailUrl) return "found-no-import";
  if (preview.metadataSupported) return "found-no-import";
  return "platform-no-import";
}

export async function previewIngestUrl(raw: string, deps: PreviewDeps = {}): Promise<IngestPreview> {
  const classified = classifiedOrThrow(raw);
  const provider = getMediaImportProvider(classified.provider);
  const base: IngestPreview = {
    provider: classified.provider,
    sourceKind: classified.sourceKind,
    url: classified.url,
    title: null,
    creatorName: null,
    thumbnailUrl: null,
    durationSeconds: null,
    platformLabel: providerLabel(classified.provider),
    ingestSupported: classified.ingestSupported,
    metadataSupported: classified.metadataSupported,
    availability: classified.ingestSupported ? "import-ready" : classified.metadataSupported ? "found-no-import" : "platform-no-import",
    message: classified.ingestSupported ? undefined : classified.reason ?? ingestErrorMessage("import-unavailable"),
    externalId: classified.externalId,
  };
  const extra = await provider.getMetadata(classified, deps);
  const merged: IngestPreview = {
    ...base,
    ...extra,
    ingestSupported: extra.ingestSupported ?? base.ingestSupported,
    metadataSupported: extra.metadataSupported ?? base.metadataSupported,
  };
  return {
    ...merged,
    availability: extra.availability ?? availabilityFromPreview(merged),
  };
}

export function ingestPreviewDepsFromEnv(source: NodeJS.ProcessEnv = process.env): PreviewDeps {
  return {
    youtubeApiKey: source.YOUTUBE_API_KEY?.trim() || source.GOOGLE_API_KEY?.trim() || "",
    twitchClientId: source.TWITCH_CLIENT_ID?.trim() || "",
    twitchClientSecret: source.TWITCH_CLIENT_SECRET?.trim() || "",
  };
}
