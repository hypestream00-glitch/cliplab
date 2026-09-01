import { STALE_ACTIVE_MS } from "@/lib/jobs/status";

export function shouldRecoverPersistedJob(params: {
  status: string;
  createdAt: Date;
  startedAt: Date | null;
  workerStatus: "CONNECTED" | "NOT RUNNING";
  bullJobLive?: boolean;
  now?: Date;
}) {
  const now = params.now ?? new Date();
  if (params.status === "WAITING" || params.status === "DELAYED") {
    return now.getTime() - params.createdAt.getTime() > 15_000;
  }
  if (params.status === "ACTIVE" && params.startedAt) {
    const stale = now.getTime() - params.startedAt.getTime() > STALE_ACTIVE_MS;
    if (!stale) return false;
    if (params.workerStatus === "NOT RUNNING") return true;
    if (params.bullJobLive === false) return true;
  }
  return false;
}
