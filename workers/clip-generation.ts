import { createWorker } from "@/lib/queue";
import { logger } from "@/lib/logger";

export function createClipGenerationWorker() {
  return createWorker("clip-generation", async (payload) => {
    logger.info({ payload }, "clip generation job");
  });
}
