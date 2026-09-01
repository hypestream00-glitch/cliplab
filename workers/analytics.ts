import { createWorker } from "@/lib/queue";
import { syncDueTikTokAnalytics } from "@/lib/services/tiktok-analytics";
import { syncDueMetaAnalytics } from "@/lib/services/meta-analytics";
import { syncDueXAnalytics } from "@/lib/services/x-analytics";
import { syncDueYouTubeAnalytics } from "@/lib/services/youtube-analytics";
import { syncDueUploadPostAnalytics } from "@/lib/social/upload-post/analytics";
import { isUploadPostPrimary } from "@/lib/social/router";
import { syncCompetitionSubmissionMetrics } from "@/lib/competitions/sync";
import { refreshCompetitionStatuses } from "@/lib/competitions/admin";

export function createAnalyticsWorker() {
  return createWorker("analytics-sync", async () => {
    await refreshCompetitionStatuses();
    if (isUploadPostPrimary()) {
      await syncDueUploadPostAnalytics();
    } else {
      await syncDueTikTokAnalytics();
      await syncDueMetaAnalytics();
      await syncDueXAnalytics();
      await syncDueYouTubeAnalytics();
    }
    await syncCompetitionSubmissionMetrics();
  });
}
