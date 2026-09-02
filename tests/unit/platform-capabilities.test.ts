import { afterEach, describe, expect, it, vi } from "vitest";
import { resolvePlatformCapabilities } from "@/lib/platforms/capabilities";
import { classifyMetricsSource, metricsEligibleForOfficialPayout } from "@/lib/platforms/metrics-source";
import { computeTrendScore } from "@/lib/trending/score";
import { kickOAuthProvider, unconfiguredKickProvider } from "@/lib/social/kick/provider";
import { bilibiliOAuthProvider } from "@/lib/social/bilibili/provider";
import { usesOfficialOAuth, usesDevelopmentOAuth, createOAuthState, createPkcePair } from "@/lib/social/oauth";
import { fetchKickPopular } from "@/lib/trending/kick";
import { fetchYouTubeTrending } from "@/lib/trending/youtube";
import { classifyIngestUrl } from "@/lib/ingest/classify";

describe("platform capability matrix", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("keeps twitch live/trending real and competition tracking off", () => {
    vi.stubEnv("TWITCH_CLIENT_ID", "id");
    vi.stubEnv("TWITCH_CLIENT_SECRET", "secret");
    const caps = resolvePlatformCapabilities();
    expect(caps.TWITCH.trending).toBe("AVAILABLE");
    expect(caps.TWITCH.live).toBe("AVAILABLE");
    expect(caps.TWITCH.publish).toBe("NOT_SUPPORTED");
    expect(caps.TWITCH.importMedia).toBe("NOT_SUPPORTED");
    expect(caps.TWITCH.competitionTracking).toBe("NOT_SUPPORTED");
  });

  it("marks youtube trending available only with api key and publish as approval without flag", () => {
    vi.stubEnv("YOUTUBE_API_KEY", "yt-key");
    vi.stubEnv("GOOGLE_CLIENT_ID", "gid");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "gsecret");
    vi.stubEnv("YOUTUBE_UPLOAD_APPROVED", "");
    const caps = resolvePlatformCapabilities();
    expect(caps.YOUTUBE.trending).toBe("AVAILABLE");
    expect(caps.YOUTUBE.oauth).toBe("AVAILABLE");
    expect(caps.YOUTUBE.publish).toBe("REQUIRES_APPROVAL");
    expect(caps.YOUTUBE.importMedia).toBe("NOT_SUPPORTED");
    expect(caps.YOUTUBE.competitionTracking).toBe("AVAILABLE");
  });

  it("does not fake bilibili trending or competition payout", () => {
    const caps = resolvePlatformCapabilities();
    expect(caps.BILIBILI.trending).toBe("NOT_SUPPORTED");
    expect(caps.BILIBILI.competitionTracking).toBe("NOT_SUPPORTED");
    expect(caps.BILIBILI.oauth).toBe("NOT_CONFIGURED");
  });

  it("keeps tiktok and instagram global trending unsupported", () => {
    const caps = resolvePlatformCapabilities();
    expect(caps.TIKTOK.trending).toBe("NOT_SUPPORTED");
    expect(caps.INSTAGRAM.trending).toBe("NOT_SUPPORTED");
  });
});

describe("oauth security", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });
  it("uses official oauth for twitch kick bilibili without mock when configured", () => {
    expect(usesOfficialOAuth("TWITCH")).toBe(true);
    expect(usesOfficialOAuth("KICK")).toBe(true);
    expect(usesOfficialOAuth("BILIBILI")).toBe(true);
    expect(usesDevelopmentOAuth("TWITCH")).toBe(false);
    expect(createOAuthState().length).toBeGreaterThan(16);
    const pkce = createPkcePair();
    expect(pkce.challenge).not.toBe(pkce.verifier);
  });

  it("builds kick authorize url with pkce and does not call the network", () => {
    vi.stubEnv("KICK_CLIENT_ID", "kick-id");
    vi.stubEnv("KICK_CLIENT_SECRET", "kick-secret");
    const url = kickOAuthProvider.getAuthorizationUrl({
      state: "st",
      codeChallenge: "challenge",
      redirectUri: "https://cortaclip.com/api/social/oauth/callback",
    });
    expect(url).toContain("https://id.kick.com/oauth/authorize");
    expect(url).toContain("code_challenge=challenge");
    expect(url).toContain("code_challenge_method=S256");
    expect(url).not.toContain("kick-secret");
  });

  it("builds bilibili authorize url with gourl and state", () => {
    vi.stubEnv("BILIBILI_CLIENT_ID", "bili-id");
    vi.stubEnv("BILIBILI_CLIENT_SECRET", "bili-secret");
    const url = bilibiliOAuthProvider.getAuthorizationUrl({
      state: "csrf-token",
      redirectUri: "https://cortaclip.com/api/social/oauth/callback",
    });
    expect(url).toContain("account.bilibili.com/pc/account-pc/auth/oauth");
    expect(url).toContain("client_id=bili-id");
    expect(url).toContain("state=csrf-token");
    expect(url).toContain("gourl=");
    expect(url).not.toContain("bili-secret");
  });

  it("does not mock kick as configured without credentials", () => {
    expect(unconfiguredKickProvider.configured).toBe(false);
    expect(unconfiguredKickProvider.mocked).toBe(false);
    expect(() => unconfiguredKickProvider.getAuthorizationUrl({ state: "x", redirectUri: "https://x" })).toThrow(/não está configurado/i);
  });
});

describe("kick trending provider", () => {
  it("returns unavailable without credentials", async () => {
    const result = await fetchKickPopular({ kickClientId: "", kickClientSecret: "" });
    expect(result.available).toBe(false);
    expect(result.items).toEqual([]);
  });

  it("normalizes official livestreams and uses viewers not invented views", async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (String(url).includes("/oauth/token")) {
        return new Response(JSON.stringify({ access_token: "tok" }), { status: 200 });
      }
      return new Response(
        JSON.stringify({
          data: [
            {
              id: "live-1",
              title: "Ranked",
              thumbnail: "https://kick.com/thumb.jpg",
              viewer_count: 1200,
              started_at: "2026-09-01T20:00:00Z",
              broadcaster_user: { username: "clipper" },
              category: { name: "Just Chatting" },
              channel: { slug: "clipper" },
            },
          ],
        }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;
    const result = await fetchKickPopular({ kickClientId: "id", kickClientSecret: "secret", fetchImpl });
    expect(result.available).toBe(true);
    expect(result.items[0]?.kind).toBe("live");
    expect(result.items[0]?.viewCount).toBe(1200);
    expect(result.items[0]?.canonicalUrl).toBe("https://kick.com/clipper");
  });
});

describe("youtube region and missing stats", () => {
  it("rejects global region without calling the api", async () => {
    const fetchImpl = vi.fn(async () => new Response("no", { status: 200 })) as unknown as typeof fetch;
    const result = await fetchYouTubeTrending({ youtubeApiKey: "key", region: "GLOBAL", fetchImpl });
    expect(result.available).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("does not invent like/comment zeros when statistics omit them", async () => {
    let requested = "";
    const fetchImpl = vi.fn(async (url: string) => {
      requested = String(url);
      return new Response(
        JSON.stringify({
          items: [
            {
              id: "vid1",
              snippet: { title: "A", channelTitle: "C", publishedAt: "2026-09-01T12:00:00Z", categoryId: "20" },
              statistics: { viewCount: "100" },
              contentDetails: { duration: "PT1M" },
            },
          ],
        }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;
    const result = await fetchYouTubeTrending({ youtubeApiKey: "key", region: "BR", fetchImpl });
    expect(result.items[0]?.engagement).toBeNull();
    expect(result.items[0]?.viewCount).toBe(100);
    expect(requested).toContain("regionCode=BR");
  });
});

describe("trend score kinds", () => {
  it("does not score live viewers as vod views", () => {
    const content = computeTrendScore({ viewCount: 40000, kind: "content" });
    const live = computeTrendScore({ viewCount: 40000, kind: "live" });
    expect(content.inputs.views).toBeDefined();
    expect(content.inputs.currentViewers).toBeUndefined();
    expect(live.inputs.currentViewers).toBeDefined();
    expect(live.inputs.views).toBeUndefined();
  });
});

describe("metrics source classification", () => {
  it("only official and authorized sources can enter payout", () => {
    expect(classifyMetricsSource("youtube")).toBe("OFFICIAL_API");
    expect(classifyMetricsSource("upload-post")).toBe("AUTHORIZED_PROVIDER");
    expect(classifyMetricsSource("manual")).toBe("MANUAL_UNVERIFIED");
    expect(metricsEligibleForOfficialPayout("manual")).toBe(false);
    expect(metricsEligibleForOfficialPayout("tiktok")).toBe(true);
  });
});

describe("bilibili ingest", () => {
  it("detects bilibili urls as metadata-only", () => {
    const classified = classifyIngestUrl("https://www.bilibili.com/video/BV1xx411c7mD");
    expect(classified?.provider).toBe("BILIBILI");
    expect(classified?.ingestSupported).toBe(false);
    expect(classified?.metadataSupported).toBe(true);
  });
});

describe("external provider integration (skipped)", () => {
  const run = process.env.RUN_EXTERNAL_PROVIDER_TESTS === "true";
  it.skipIf(!run)("never runs against live APIs in CI by default", () => {
    expect(run).toBe(true);
  });
});
