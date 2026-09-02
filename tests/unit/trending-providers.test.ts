import { describe, expect, it, vi } from "vitest";
import { fetchYouTubeTrending, mapYouTubeVideoToTrendingItem, parseYouTubeApiError } from "@/lib/trending/youtube";
import { fetchTwitchPopular, unsupportedTrending } from "@/lib/trending/twitch";
import { computeTrendScore } from "@/lib/trending/score";
import { mapYouTubeCategory, youtubeApiKeyFromEnv } from "@/lib/trending/providers";
import {
  isStaleEmptyYouTubeCache,
  shouldCacheYouTubeResult,
  youtubeTrendingCacheKey,
  twitchTrendingCacheKey,
} from "@/lib/trending/cache";
import { logger } from "@/lib/logger";

function googleVideo(id: string, regionExtra?: Record<string, unknown>) {
  return {
    id,
    snippet: {
      title: `Video ${id}`,
      channelId: "UCchannel",
      channelTitle: "Canal Oficial",
      publishedAt: "2026-09-01T12:00:00Z",
      categoryId: "20",
      thumbnails: { high: { url: `https://i.ytimg.com/vi/${id}/hqdefault.jpg` } },
    },
    statistics: { viewCount: "1200000", likeCount: "8000", commentCount: "400" },
    contentDetails: { duration: "PT12M3S" },
    ...regionExtra,
  };
}

function mockFetch(body: unknown, status = 200) {
  return vi.fn(async () =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }),
  ) as unknown as typeof fetch;
}

describe("youtube trending provider", () => {
  it("returns unavailable without an api key", async () => {
    const result = await fetchYouTubeTrending({ youtubeApiKey: "" });
    expect(result.available).toBe(false);
    expect(result.items).toEqual([]);
    expect(result.error?.reason).toBe("missing-key");
  });

  it("reads YOUTUBE_API_KEY as the canonical env name", () => {
    expect(youtubeApiKeyFromEnv({ NODE_ENV: "test", YOUTUBE_API_KEY: "yt-from-canonical" } as NodeJS.ProcessEnv)).toBe("yt-from-canonical");
    expect(youtubeApiKeyFromEnv({ NODE_ENV: "test", GOOGLE_API_KEY: "fallback" } as NodeJS.ProcessEnv)).toBe("fallback");
    expect(youtubeApiKeyFromEnv({ NODE_ENV: "test", YOUTUBE_API_KEY: "canonical", GOOGLE_API_KEY: "fallback" } as NodeJS.ProcessEnv)).toBe("canonical");
  });

  it.each(["BR", "US", "PT"] as const)("requests official mostPopular for region %s", async (region) => {
    const fetchImpl = vi.fn(async (url: string) => {
      const parsed = new URL(String(url));
      expect(parsed.searchParams.get("part")).toBe("snippet,statistics,contentDetails");
      expect(parsed.searchParams.get("chart")).toBe("mostPopular");
      expect(parsed.searchParams.get("regionCode")).toBe(region);
      expect(parsed.searchParams.get("maxResults")).toBe("32");
      expect(parsed.searchParams.has("key")).toBe(true);
      return new Response(JSON.stringify({ items: [googleVideo(`${region}id123456`)] }), { status: 200 });
    }) as unknown as typeof fetch;
    const result = await fetchYouTubeTrending({ youtubeApiKey: "test-key", fetchImpl, region });
    expect(result.available).toBe(true);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.region).toBe(region);
    expect(result.items[0]?.platform).toBe("YOUTUBE");
  });

  it("normalizes official mostPopular videos and does not invent 24h views", async () => {
    const fetchImpl = mockFetch({ items: [googleVideo("abc123xyz00")] });
    const result = await fetchYouTubeTrending({ youtubeApiKey: "test-key", fetchImpl, region: "BR" });
    expect(result.available).toBe(true);
    expect(result.items[0]?.title).toBe("Video abc123xyz00");
    expect(result.items[0]?.creatorName).toBe("Canal Oficial");
    expect(result.items[0]?.channelId).toBe("UCchannel");
    expect(result.items[0]?.category).toBe("Games");
    expect(result.items[0]?.durationSeconds).toBe(723);
    expect(result.items[0]?.canonicalUrl).toBe("https://www.youtube.com/watch?v=abc123xyz00");
    expect(result.items[0]?.likeCount).toBe(8000);
    expect(result.items[0]?.thumbnailUrl).toContain("hqdefault.jpg");
    const score = computeTrendScore({
      viewCount: result.items[0]?.viewCount,
      publishedAt: result.items[0]?.publishedAt,
    });
    expect(score.inputs.velocity24h).toBeUndefined();
    expect(score.score).not.toBeNull();
  });

  it("keeps an official empty chart as empty without treating it as success cache", async () => {
    const fetchImpl = mockFetch({ items: [] });
    const result = await fetchYouTubeTrending({ youtubeApiKey: "test-key", fetchImpl, region: "BR" });
    expect(result.available).toBe(true);
    expect(result.items).toEqual([]);
    expect(shouldCacheYouTubeResult(result)).toBe(false);
    expect(isStaleEmptyYouTubeCache(result)).toBe(true);
  });

  it("returns a safe quota error instead of a silent empty list", async () => {
    const fetchImpl = mockFetch(
      { error: { code: 403, status: "RESOURCE_EXHAUSTED", errors: [{ reason: "quotaExceeded" }] } },
      403,
    );
    const result = await fetchYouTubeTrending({ youtubeApiKey: "test-key", fetchImpl, region: "BR" });
    expect(result.available).toBe(false);
    expect(result.items).toEqual([]);
    expect(result.error?.reason).toBe("quotaExceeded");
    expect(result.error?.httpStatus).toBe(403);
    expect(result.error?.message).toMatch(/cota/i);
  });

  it("treats HTTP 429 as a quota/rate error with details", async () => {
    const fetchImpl = vi.fn(async () => new Response("no", { status: 429 })) as unknown as typeof fetch;
    const result = await fetchYouTubeTrending({ youtubeApiKey: "test-key", fetchImpl });
    expect(result.items).toEqual([]);
    expect(result.available).toBe(false);
    expect(result.error?.httpStatus).toBe(429);
    expect(result.error?.message).toMatch(/cota/i);
  });

  it("does not log the API key", async () => {
    const key = "yt-secret-do-not-log";
    const spy = vi.spyOn(logger, "info").mockImplementation(() => logger);
    const fetchImpl = mockFetch({ items: [googleVideo("logcheck1")] });
    await fetchYouTubeTrending({ youtubeApiKey: key, fetchImpl, region: "BR" });
    expect(JSON.stringify(spy.mock.calls)).not.toContain(key);
    spy.mockRestore();
  });
});

describe("youtube error parsing and mapping", () => {
  it("maps Google reasons to safe messages", () => {
    expect(parseYouTubeApiError({ error: { errors: [{ reason: "API_KEY_INVALID" }] } }, 400).message).toMatch(/chave/i);
    expect(parseYouTubeApiError({ error: { errors: [{ reason: "accessNotConfigured" }] } }, 403).message).toMatch(/habilitada/i);
    expect(parseYouTubeApiError({ error: { errors: [{ reason: "ipRefererBlocked" }] } }, 403).message).toMatch(/referer|IP/i);
    expect(parseYouTubeApiError({ error: { errors: [{ reason: "forbidden" }] } }, 403).message).toMatch(/recusou/i);
  });

  it("does not invent like zeros when statistics omit them", () => {
    const mapped = mapYouTubeVideoToTrendingItem(
      {
        id: "vid1",
        snippet: { title: "A", channelTitle: "C", publishedAt: "2026-09-01T12:00:00Z", categoryId: "20" },
        statistics: { viewCount: "100" },
        contentDetails: { duration: "PT1M" },
      },
      "BR",
    );
    expect(mapped?.engagement).toBeNull();
    expect(mapped?.likeCount).toBeNull();
    expect(mapped?.viewCount).toBe(100);
  });
});

describe("trending provider collection", () => {
  it("keeps tiktok/instagram/bilibili as unavailable public trending sources", () => {
    expect(unsupportedTrending("TIKTOK").available).toBe(false);
    expect(unsupportedTrending("TIKTOK").reason).toBe("Fonte ainda não disponível");
    expect(unsupportedTrending("BILIBILI").available).toBe(false);
    expect(mapYouTubeCategory("25")).toBe("Notícias");
    expect(mapYouTubeCategory("10")).toBe("Música");
    expect(youtubeTrendingCacheKey("BR")).toBe("trending:youtube:BR:all:popular");
    expect(twitchTrendingCacheKey()).toBe("trending:twitch:popular");
  });

  it("requests a Twitch app token in the POST body, not the query string", async () => {
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).includes("oauth2/token")) {
        expect(String(url)).not.toContain("secret");
        expect(String(init?.body)).toContain("client_secret=twitch-secret");
        expect(String(init?.body)).toContain("grant_type=client_credentials");
        return new Response(JSON.stringify({ access_token: "tok" }), { status: 200 });
      }
      return new Response(
        JSON.stringify({
          data: [
            {
              id: "tw-1",
              user_name: "clipper",
              title: "Ranked",
              thumbnail_url: "https://static-cdn.jtvnw.net/{width}x{height}.jpg",
              viewer_count: 42,
              started_at: "2026-09-01T20:00:00Z",
              game_name: "Just Chatting",
            },
          ],
        }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;
    const result = await fetchTwitchPopular({
      twitchClientId: "id",
      twitchClientSecret: "twitch-secret",
      fetchImpl,
    });
    expect(result.available).toBe(true);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.platform).toBe("TWITCH");
    expect(result.items[0]?.viewCount).toBe(42);
  });
});
