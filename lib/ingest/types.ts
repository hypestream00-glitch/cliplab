import type { SourceKind } from "@/generated/prisma/client";
import type { HostLookup } from "@/lib/security/ssrf";

export type IngestProvider = "YOUTUBE" | "TWITCH" | "KICK" | "TIKTOK" | "INSTAGRAM" | "BILIBILI" | "GOOGLE_DRIVE" | "DIRECT_URL";

export type ClassifiedIngestUrl = {
  provider: IngestProvider;
  sourceKind: SourceKind;
  url: string;
  externalId?: string;
  ingestSupported: boolean;
  metadataSupported: boolean;
  reason?: string;
};

export type MediaImportCapabilities = {
  metadata: boolean;
  import: boolean;
  requiresAuth: boolean;
  directMedia: boolean;
};

export type MediaImportContext = {
  workspaceId?: string;
  maxBytes?: number;
  lookup?: HostLookup;
  fetchImpl?: typeof fetch;
  youtubeApiKey?: string;
  twitchClientId?: string;
  twitchClientSecret?: string;
  signal?: AbortSignal;
};

export type IngestPreviewAvailability = "import-ready" | "found-no-import" | "platform-no-import" | "not-media";

export type IngestPreview = {
  provider: IngestProvider;
  sourceKind: SourceKind;
  url: string;
  title: string | null;
  creatorName: string | null;
  thumbnailUrl: string | null;
  durationSeconds: number | null;
  platformLabel: string;
  ingestSupported: boolean;
  metadataSupported: boolean;
  availability: IngestPreviewAvailability;
  message?: string;
  externalId?: string;
};

export type ImportedMedia = {
  storageKey: string;
  mimeType: string;
  sizeBytes: number;
  filename: string;
  finalUrl: string;
};

export type MediaImportProvider = {
  id: IngestProvider;
  capabilities: MediaImportCapabilities;
  detect(url: URL): ClassifiedIngestUrl | null;
  getMetadata(classified: ClassifiedIngestUrl, ctx: MediaImportContext): Promise<Partial<IngestPreview>>;
  canImport(classified: ClassifiedIngestUrl, ctx?: MediaImportContext): boolean;
  importMedia?(classified: ClassifiedIngestUrl, ctx: MediaImportContext): Promise<ImportedMedia>;
};
