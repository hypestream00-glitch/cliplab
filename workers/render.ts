import { createWorker } from "@/lib/queue";
import { processRender } from "@/lib/services/renders";

export function createRenderWorker() {
  return createWorker("render", async (payload) => {
    await processRender(payload.entityId);
  });
}
