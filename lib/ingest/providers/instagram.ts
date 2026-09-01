import { ingestErrorMessage } from "@/lib/ingest/errors";
import type { MediaImportProvider } from "@/lib/ingest/types";
import { hostOf } from "@/lib/ingest/url";

export const instagramProvider: MediaImportProvider = {
  id: "INSTAGRAM",
  capabilities: {
    metadata: false,
    import: false,
    requiresAuth: true,
    directMedia: false,
  },
  detect(url) {
    const host = hostOf(url);
    if (host !== "instagram.com" && !host.endsWith(".instagram.com")) return null;
    return {
      provider: "INSTAGRAM",
      sourceKind: "DIRECT_URL",
      url: url.toString(),
      ingestSupported: false,
      metadataSupported: false,
      reason: ingestErrorMessage("import-unavailable"),
    };
  },
  canImport() {
    return false;
  },
  async getMetadata() {
    return {
      ingestSupported: false,
      availability: "platform-no-import" as const,
      message: ingestErrorMessage("import-unavailable"),
    };
  },
};
