import { createWorker } from "@/lib/queue";
import { logger } from "@/lib/logger";

export function createPublishingWorker() {
  return createWorker("social-publishing", async (payload) => {
    logger.info({ payload }, "publishing job — mock publications are never reported as real");
  });
}
