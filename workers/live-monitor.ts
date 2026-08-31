import { createWorker } from "@/lib/queue";
import { logger } from "@/lib/logger";

export function createLiveMonitorWorker() {
  return createWorker("live-monitor", async (payload) => {
    logger.info({ payload }, "live monitor");
  });
}
