import { ingestErrorMessage } from "@/lib/ingest/errors";
import type { MediaImportProvider } from "@/lib/ingest/types";
import { hostOf } from "@/lib/ingest/url";

export const kickProvider: MediaImportProvider = {
  id: "KICK",
  capabilities: {
    metadata: false,
    import: false,
    requiresAuth: false,
    directMedia: false,
  },
  detect(url) {
    const host = hostOf(url);
    if (host !== "kick.com" && !host.endsWith(".kick.com")) return null;
    return {
      provider: "KICK",
      sourceKind: "KICK",
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
