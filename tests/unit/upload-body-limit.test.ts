import { describe, expect, it } from "vitest";
import nextConfig from "../../next.config";
import { UPLOAD_BODY_SIZE_LIMIT } from "@/lib/config/upload-limits";

describe("upload body limits", () => {
  it("raises the Next.js proxy buffer above the 10MB default that truncates MP4 uploads", () => {
    const megabytes = Number.parseInt(UPLOAD_BODY_SIZE_LIMIT, 10);
    expect(Number.isFinite(megabytes)).toBe(true);
    expect(megabytes).toBeGreaterThan(10);
    expect(nextConfig.experimental?.serverActions?.bodySizeLimit).toBe(UPLOAD_BODY_SIZE_LIMIT);
    expect(nextConfig.experimental?.proxyClientMaxBodySize).toBe(UPLOAD_BODY_SIZE_LIMIT);
  });
});
