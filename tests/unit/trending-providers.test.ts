import { describe, expect, it, vi } from "vitest";
import { fetchYouTubeTrending } from "@/lib/trending/youtube";
import { fetchTwitchPopular, unsupportedTrending } from "@/lib/trending/twitch";
import { computeTrendScore } from "@/lib/trending/score";
import { mapYouTubeCategory } from "@/lib/trending/providers";
import { youtubeTrendingCacheKey, twitchTrendingCacheKey } from "@/lib/trending/cache";

describe("youtube trending provider", () => {
  it("returns unavailable without an api key", async () => {
    const result = await fetchYouTubeTrending({ youtubeApiKey: "" });
    expect(result.available).toBe(false);
    expect(result.items).toEqual([]);
  });

  it("normalizes official mostPopular videos and does not invent 24h views", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          items: [
            {
              id: "abc123xyz00",
              snippet: {
                title: "Jogo ao vivo",
                channelTitle: "Canal",
                publishedAt: "2026-09-01T12:00:00Z",
                categoryId: "20",
                thumbnails: { high: { url: "https://i.ytimg.com/vi/abc/hqdefault.jpg" } },
              },
              statistics: { viewCount: "1200000", likeCount: "8000", commentCount: "400" },
              contentDetails: { duration: "PT12M3S" },
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    ) as unknown as typeof fetch;
    const result = await fetchYouTubeTrending({ youtubeApiKey: "test-key", fetchImpl, region: "BR" });
    expect(result.available).toBe(true);
    expect(result.items[0]?.title).toBe("Jogo ao vivo");
    expect(result.items[0]?.category).toBe("Games");
    expect(result.items[0]?.durationSeconds).toBe(723);
    expect(result.items[0]?.canonicalUrl).toContain("abc123xyz00");
    const score = computeTrendScore({
      viewCount: result.items[0]?.viewCount,
      publishedAt: result.items[0]?.publishedAt,
    });
    expect(score.inputs.velocity24h).toBeUndefined();
    expect(score.score).not.toBeNull();
  });

  it("treats rate limits as empty without throwing", async () => {
    const fetchImpl = vi.fn(async () => new Response("no", { status: 429 })) as unknown as typeof fetch;
    const result = await fetchYouTubeTrending({ youtubeApiKey: "test-key", fetchImpl });
    expect(result.items).toEqual([]);
    expect(result.reason).toBe("rate-limited");
  });
});

describe("trending provider collection", () => {
  it("keeps kick/tiktok/instagram as unavailable sources", () => {
    expect(unsupportedTrending("KICK").available).toBe(false);
    expect(unsupportedTrending("TIKTOK").reason).toBe("Fonte ainda não disponível");
    expect(mapYouTubeCategory("25")).toBe("Notícias");
    expect(youtubeTrendingCacheKey("BR")).toBe("trending:youtube:BR");
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
      return new Response(JSON.stringify({ data: [] }), { status: 200 });
    }) as unknown as typeof fetch;
    const result = await fetchTwitchPopular({
      twitchClientId: "id",
      twitchClientSecret: "twitch-secret",
      fetchImpl,
    });
    expect(result.available).toBe(true);
    expect(result.items).toEqual([]);
  });
});
