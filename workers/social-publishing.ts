import { createWorker } from "@/lib/queue";
import { enqueueDueScheduledPublications, processPublication } from "@/lib/services/publishing";
import { syncDueUploadPostStatuses } from "@/lib/social/upload-post/publish";

export function createPublishWorker() {
  return createWorker("social-publishing", async (payload) => {
    if (payload.type === "social-publishing") {
      await enqueueDueScheduledPublications();
      await syncDueUploadPostStatuses();
      await processPublication(payload.entityId);
    }
  });
}
