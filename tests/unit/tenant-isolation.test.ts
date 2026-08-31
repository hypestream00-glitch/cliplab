import { describe, expect, it } from "vitest";
import { assertWorkspaceMatch, TenantAccessError, tenantWhere } from "@/lib/security/tenant";
import {
  visibleClipWhere,
  visibleProjectWhere,
  visiblePublicationWhere,
  visibleSocialAccountWhere,
  visibleMetricSnapshotWhere,
} from "@/lib/data/visibility";

describe("workspace isolation", () => {
  it("rejects cross-workspace resource ids", () => {
    expect(() => assertWorkspaceMatch("ws_b", "ws_a")).toThrow(TenantAccessError);
    expect(() => assertWorkspaceMatch(undefined, "ws_a")).toThrow(TenantAccessError);
    expect(() => assertWorkspaceMatch("ws_a", "ws_a")).not.toThrow();
  });

  it("scopes every visible query by workspace", () => {
    expect(tenantWhere("ws_a")).toEqual({ workspaceId: "ws_a" });
    expect(visibleProjectWhere("ws_a").workspaceId).toBe("ws_a");
    expect(visibleClipWhere("ws_a").workspaceId).toBe("ws_a");
    expect(visiblePublicationWhere("ws_a").workspaceId).toBe("ws_a");
    expect(visibleSocialAccountWhere("ws_a").workspaceId).toBe("ws_a");
    expect(visibleMetricSnapshotWhere("ws_a")).toMatchObject({ socialAccount: { workspaceId: "ws_a" } });
  });
});
