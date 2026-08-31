import { STALE_ACTIVE_MS } from "@/lib/jobs/status";

export function shouldRecoverPersistedJob(params: {
  status: string;
  createdAt: Date;
  startedAt: Date | null;
  workerStatus: "CONNECTED" | "NOT RUNNING";
  now?: Date;
}) {
  const now = params.now ?? new Date();
  if (params.status === "WAITING" || params.status === "DELAYED") {
    return now.getTime() - params.createdAt.getTime() > 15_000;
  }
  if (params.status === "ACTIVE" && params.workerStatus === "NOT RUNNING" && params.startedAt) {
    return now.getTime() - params.startedAt.getTime() > STALE_ACTIVE_MS;
  }
  return false;
}
