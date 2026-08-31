export function resumeJobDecision(latestStatus: string | null | undefined): "skip" | "reuse" | "create" {
  if (!latestStatus) return "create";
  if (latestStatus === "WAITING" || latestStatus === "ACTIVE" || latestStatus === "QUEUED" || latestStatus === "PROCESSING") return "skip";
  if (latestStatus === "FAILED" || latestStatus === "CANCELED") return "reuse";
  return "create";
}
