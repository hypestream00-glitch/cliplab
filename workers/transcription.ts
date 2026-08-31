import { createWorker } from "@/lib/queue";
import { logger } from "@/lib/logger";

export function createTranscriptionWorker() {
  return createWorker("transcription", async (payload) => {
    logger.info({ payload }, "transcription job (mock-capable)");
  });
}
