import { createWorker } from "@/lib/queue";
import { processBulkDownload } from "@/lib/services/bulk-download";

export function createBulkDownloadWorker() {
  return createWorker("bulk-download", async (payload) => {
    await processBulkDownload(payload.entityId);
  });
}
