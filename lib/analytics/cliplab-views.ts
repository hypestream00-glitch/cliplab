import { prisma } from "@/lib/db/prisma";
import { visiblePublicationWhere } from "@/lib/data/visibility";
import { realSnapshotMetric } from "@/lib/data/metrics-display";

export async function getCliplabPublishedViews(workspaceId: string): Promise<number | null> {
  const publications = await prisma.socialPublication.findMany({
    where: { ...visiblePublicationWhere(workspaceId), status: "PUBLISHED" },
    include: {
      targets: {
        include: { postMetrics: { orderBy: { capturedAt: "desc" }, take: 1 } },
      },
    },
  });
  if (publications.length === 0) return null;
  let total = 0;
  let found = false;
  for (const publication of publications) {
    for (const target of publication.targets) {
      const snapshot = target.postMetrics[0];
      const fromSnap = snapshot ? realSnapshotMetric(snapshot, "views") : null;
      const fromTarget = typeof target.views === "number" && Number.isFinite(target.views) ? target.views : null;
      const value = fromSnap ?? fromTarget;
      if (value != null) {
        total += value;
        found = true;
      }
    }
  }
  return found ? total : null;
}
