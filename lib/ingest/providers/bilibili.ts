import type { MediaImportProvider } from "@/lib/ingest/types";
import { hostOf } from "@/lib/ingest/url";

const ORIGINAL_FILE = "Envie o arquivo original para criar clips.";

export const bilibiliIngestProvider: MediaImportProvider = {
  id: "BILIBILI",
  capabilities: {
    metadata: true,
    import: false,
    requiresAuth: false,
    directMedia: false,
  },
  detect(url) {
    const host = hostOf(url);
    if (host !== "bilibili.com" && !host.endsWith(".bilibili.com") && host !== "b23.tv") return null;
    const bv = url.pathname.match(/BV[\w]+/i)?.[0];
    return {
      provider: "BILIBILI",
      sourceKind: "DIRECT_URL",
      url: url.toString(),
      externalId: bv,
      ingestSupported: false,
      metadataSupported: true,
      reason: ORIGINAL_FILE,
    };
  },
  canImport() {
    return false;
  },
  async getMetadata(classified) {
    return {
      title: classified.externalId ? `Bilibili · ${classified.externalId}` : "Bilibili",
      ingestSupported: false,
      metadataSupported: true,
      availability: "found-no-import" as const,
      message: ORIGINAL_FILE,
    };
  },
};
