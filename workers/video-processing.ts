import { createWorker } from "@/lib/queue";
import { processProjectPipeline } from "@/lib/services/pipeline";

export function createProjectPipelineWorker() {
  return createWorker("video-import", async (payload) => {
    await processProjectPipeline(payload.entityId);
  });
}
