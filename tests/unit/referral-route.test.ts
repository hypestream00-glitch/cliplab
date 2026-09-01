import { describe, expect, it, vi } from "vitest";
import { REFERRAL_COOKIE } from "@/lib/referral/cookie";

const findReferralProfileByCode = vi.fn();
const setReferralCookie = vi.fn();

vi.mock("@/lib/referral/profile", () => ({
  findReferralProfileByCode: (...args: unknown[]) => findReferralProfileByCode(...args),
}));

vi.mock("@/lib/referral/cookie", async () => {
  const actual = await vi.importActual<typeof import("@/lib/referral/cookie")>("@/lib/referral/cookie");
  return {
    ...actual,
    setReferralCookie: (...args: unknown[]) => setReferralCookie(...args),
  };
});

describe("referral landing /r/:code", () => {
  it("keeps the internal cookie name and stores attribution for a valid code", async () => {
    expect(REFERRAL_COOKIE).toBe("cliplab_ref");
    findReferralProfileByCode.mockResolvedValue({ userId: "referrer", code: "ABC123XY" });
    setReferralCookie.mockResolvedValue(undefined);
    process.env.APP_URL = "https://cortaclip.com";
    const { GET } = await import("@/app/r/[code]/route");
    const response = await GET(new Request("https://cortaclip.com/r/ABC123XY"), {
      params: Promise.resolve({ code: "ABC123XY" }),
    });
    expect(setReferralCookie).toHaveBeenCalledWith("ABC123XY");
    expect(response.status).toBeGreaterThanOrEqual(300);
    expect(response.headers.get("location")).toBe("https://cortaclip.com/register?ref=ABC123XY");
  });

  it("does not set a cookie for an unknown code", async () => {
    findReferralProfileByCode.mockResolvedValue(null);
    setReferralCookie.mockClear();
    process.env.APP_URL = "https://cortaclip.com";
    const { GET } = await import("@/app/r/[code]/route");
    const response = await GET(new Request("https://cortaclip.com/r/NOPE"), {
      params: Promise.resolve({ code: "NOPE" }),
    });
    expect(setReferralCookie).not.toHaveBeenCalled();
    expect(response.headers.get("location")).toBe("https://cortaclip.com/register");
  });
});
