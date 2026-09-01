import { describe, expect, it, vi } from "vitest";
import { classifyIngestUrl } from "@/lib/ingest/classify";
import { isBlockedIngestUrl, isBlockedIp, assertSafeResolvedHost } from "@/lib/security/ssrf";
import { safeIngestFetch } from "@/lib/ingest/safe-fetch";
import { previewIngestUrl } from "@/lib/ingest/preview";
import { downloadDirectVideoToStorage } from "@/lib/ingest/download";
import { IngestError } from "@/lib/ingest/errors";

describe("ingest url classification", () => {
  it("accepts direct mp4/mov/webm", () => {
    const mp4 = classifyIngestUrl("https://cdn.example.com/path/video.mp4");
    expect(mp4?.provider).toBe("DIRECT_URL");
    expect(mp4?.ingestSupported).toBe(true);
  });

  it("classifies youtube as metadata-only", () => {
    const yt = classifyIngestUrl("https://www.youtube.com/watch?v=dQw4w9wgGcQ");
    expect(yt?.provider).toBe("YOUTUBE");
    expect(yt?.ingestSupported).toBe(false);
    expect(yt?.metadataSupported).toBe(true);
    expect(yt?.externalId).toBe("dQw4w9wgGcQ");
  });

  it("rejects invalid urls", () => {
    expect(classifyIngestUrl("not a url")).toBeNull();
  });

  it("marks twitch/kick/tiktok/instagram as not ingestible", () => {
    expect(classifyIngestUrl("https://www.twitch.tv/videos/123")?.ingestSupported).toBe(false);
    expect(classifyIngestUrl("https://kick.com/x")?.ingestSupported).toBe(false);
    expect(classifyIngestUrl("https://www.tiktok.com/@a/video/1")?.ingestSupported).toBe(false);
    expect(classifyIngestUrl("https://www.instagram.com/reel/abc/")?.ingestSupported).toBe(false);
  });
});

describe("ssrf ingest guard", () => {
  it("blocks localhost, metadata, private networks and file protocol", () => {
    expect(isBlockedIngestUrl("http://127.0.0.1/video.mp4")).toBe(true);
    expect(isBlockedIngestUrl("http://localhost/video.mp4")).toBe(true);
    expect(isBlockedIngestUrl("http://169.254.169.254/latest/meta-data")).toBe(true);
    expect(isBlockedIngestUrl("http://10.0.0.8/clip.mp4")).toBe(true);
    expect(isBlockedIngestUrl("file:///etc/passwd")).toBe(true);
    expect(isBlockedIngestUrl("https://cdn.example.com/video.mp4")).toBe(false);
    expect(isBlockedIp("192.168.1.10")).toBe(true);
    expect(isBlockedIp("8.8.8.8")).toBe(false);
  });

  it("blocks dns that resolves to a private ip", async () => {
    await expect(assertSafeResolvedHost("evil.example", async () => ["127.0.0.1"])).rejects.toThrow("URL de ingestão bloqueada.");
  });

  it("blocks a redirect to a private address", async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (String(url).includes("cdn.example.com")) {
        return new Response(null, { status: 302, headers: { location: "http://127.0.0.1/secret.mp4" } });
      }
      return new Response("nope", { status: 200 });
    }) as unknown as typeof fetch;
    await expect(
      safeIngestFetch("https://cdn.example.com/video.mp4", {
        fetchImpl,
        lookup: async () => ["8.8.8.8"],
      }),
    ).rejects.toMatchObject({ code: "blocked" });
  });
});

describe("ingest preview", () => {
  it("returns youtube oembed metadata without claiming download", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ title: "Clip", author_name: "Canal", thumbnail_url: "https://i.ytimg.com/vi/x/hqdefault.jpg" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    ) as unknown as typeof fetch;
    const preview = await previewIngestUrl("https://www.youtube.com/watch?v=aaaaaaaaaaa", {
      fetchImpl,
      lookup: async () => ["8.8.8.8"],
    });
    expect(preview.title).toBe("Clip");
    expect(preview.ingestSupported).toBe(false);
    expect(preview.message).toContain("não é suportado");
  });

  it("does not claim an HTML page is a downloadable video", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response("<html>nope</html>", { status: 200, headers: { "content-type": "text/html; charset=utf-8" } }),
    ) as unknown as typeof fetch;
    const preview = await previewIngestUrl("https://cdn.example.com/watch/abc", {
      fetchImpl,
      lookup: async () => ["8.8.8.8"],
    });
    expect(preview.ingestSupported).toBe(false);
    expect(preview.message).toBe("Este link ainda não é suportado.");
  });

  it("maps unauthorized youtube oembed to a private error", async () => {
    const fetchImpl = vi.fn(async () => new Response("no", { status: 401 })) as unknown as typeof fetch;
    await expect(
      previewIngestUrl("https://www.youtube.com/watch?v=aaaaaaaaaaa", { fetchImpl, lookup: async () => ["8.8.8.8"] }),
    ).rejects.toMatchObject({ code: "private" });
  });

  it("does not treat a missing oembed as a private video", async () => {
    const fetchImpl = vi.fn(async () => new Response("no", { status: 404 })) as unknown as typeof fetch;
    const preview = await previewIngestUrl("https://www.youtube.com/watch?v=aaaaaaaaaaa", {
      fetchImpl,
      lookup: async () => ["8.8.8.8"],
    });
    expect(preview.ingestSupported).toBe(false);
    expect(preview.message).toBe("Este link ainda não é suportado.");
    expect(preview.title).toContain("YouTube");
  });

  it("keeps youtube ingest disabled when oembed is blocked without calling it private", async () => {
    const fetchImpl = vi.fn(async () => new Response("no", { status: 403 })) as unknown as typeof fetch;
    const preview = await previewIngestUrl("https://www.youtube.com/watch?v=aaaaaaaaaaa", {
      fetchImpl,
      lookup: async () => ["8.8.8.8"],
    });
    expect(preview.ingestSupported).toBe(false);
    expect(preview.message).toBe("Este link ainda não é suportado.");
  });
});

describe("direct ingest download guards", () => {
  it("rejects files above the plan size limit before writing storage", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response("x", { status: 200, headers: { "content-type": "video/mp4", "content-length": "5000" } }),
    ) as unknown as typeof fetch;
    await expect(
      downloadDirectVideoToStorage({
        workspaceId: "ws_1",
        url: "https://cdn.example.com/clip.mp4",
        maxBytes: 1024,
        deps: { fetchImpl, lookup: async () => ["8.8.8.8"] },
      }),
    ).rejects.toMatchObject({ code: "too-large" });
  });

  it("times out a hanging download", async () => {
    const fetchImpl = vi.fn((_url: string, init?: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          const error = new Error("aborted");
          error.name = "AbortError";
          reject(error);
        });
      });
    }) as unknown as typeof fetch;
    await expect(
      safeIngestFetch("https://cdn.example.com/video.mp4", {
        fetchImpl,
        lookup: async () => ["8.8.8.8"],
        timeoutMs: 20,
      }),
    ).rejects.toMatchObject({ code: "timeout" });
  });
});
