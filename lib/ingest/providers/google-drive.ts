import { ingestErrorMessage } from "@/lib/ingest/errors";
import type { MediaImportProvider } from "@/lib/ingest/types";
import { hostOf } from "@/lib/ingest/url";

export const googleDriveProvider: MediaImportProvider = {
  id: "GOOGLE_DRIVE",
  capabilities: {
    metadata: false,
    import: false,
    requiresAuth: true,
    directMedia: false,
  },
  detect(url) {
    const host = hostOf(url);
    if (host !== "drive.google.com" && host !== "docs.google.com") return null;
    return {
      provider: "GOOGLE_DRIVE",
      sourceKind: "GOOGLE_DRIVE",
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
