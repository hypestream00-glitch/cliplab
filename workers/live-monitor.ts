import { createWorker } from "@/lib/queue";
import { logger } from "@/lib/logger";
import { pollMonitoredLiveChannels } from "@/lib/services/live-monitor";

export function createLiveMonitorWorker() {
  return createWorker("live-monitor", async (payload) => {
    logger.info({ jobId: payload.jobId, queue: "live-monitor" }, "live monitor tick");
    await pollMonitoredLiveChannels();
  });
}
