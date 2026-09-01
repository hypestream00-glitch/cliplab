import { describe, expect, it } from "vitest";
import { accountAnalyticsDisclaimer, cliplabViewsEmptyHint } from "@/lib/analytics/provenance";
import { realSnapshotMetric } from "@/lib/data/metrics-display";

describe("analytics provenance", () => {
  it("does not treat account snapshots as CLIPLAB clip views in the empty helper", () => {
    expect(cliplabViewsEmptyHint()).toMatch(/publicar seus primeiros clips/i);
    expect(accountAnalyticsDisclaimer()).toMatch(/fora do CortaClip/i);
    expect(accountAnalyticsDisclaimer()).not.toMatch(/CLIPLAB/);
  });

  it("only reads upload-post available metrics from account snapshots", () => {
    const snapshot = {
      views: 2277,
      likes: 10,
      comments: 1,
      shares: 0,
      rawPayload: { source: "upload-post", available: { views: true } },
    };
    expect(realSnapshotMetric(snapshot, "views")).toBe(2277);
    expect(
      realSnapshotMetric(
        { ...snapshot, rawPayload: { source: "seed" } },
        "views",
      ),
    ).toBeNull();
  });
});
