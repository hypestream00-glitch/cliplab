import { prisma } from "@/lib/db/prisma";
import { getUsableAccessToken } from "@/lib/services/social-accounts";
import { YOUTUBE_API_BASE } from "@/lib/social/youtube/config";
import { youtubeFetch } from "@/lib/social/youtube/http";
import { META_GRAPH_BASE } from "@/lib/social/meta/config";
import { metaFetch } from "@/lib/social/meta/http";
import { TIKTOK_API_BASE } from "@/lib/social/tiktok/config";
import { tiktokFetch } from "@/lib/social/tiktok/http";
import { uploadPostJson } from "@/lib/social/upload-post/http";
import { isUploadPostPrimary } from "@/lib/social/router";
import type { SocialAccount } from "@/generated/prisma/client";

export type FetchedPostMetrics = {
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  source: string;
  available: { views: boolean; likes: boolean; comments: boolean; shares: boolean };
  owned: boolean;
  notSupported?: boolean;
  transient?: boolean;
  error?: string;
};

function empty(
  source: string,
  error?: string,
  flags?: { notSupported?: boolean; transient?: boolean },
): FetchedPostMetrics {
  return {
    views: null,
    likes: null,
    comments: null,
    shares: null,
    source,
    available: { views: false, likes: false, comments: false, shares: false },
    owned: false,
    notSupported: flags?.notSupported,
    transient: flags?.transient,
    error,
  };
}

export async function fetchSubmissionMetrics(params: {
  account: SocialAccount;
  platform: string;
  postExternalId: string;
  publicationId?: string | null;
}): Promise<FetchedPostMetrics> {
    if (params.account.mock) return empty("mock", "Conta de demonstração não entra no ranking.", { notSupported: true });
    try {
    if (isUploadPostPrimary() && params.account.provider === "UPLOAD_POST" && params.publicationId) {
      const publication = await prisma.socialPublication.findUnique({
        where: { id: params.publicationId },
        select: { providerPublicationId: true },
      });
      if (publication?.providerPublicationId) {
        const json = await uploadPostJson<Record<string, unknown>>({
          method: "GET",
          path: `/uploadposts/post-analytics/${encodeURIComponent(publication.providerPublicationId)}`,
        }).catch(() => null);
        if (!json) return empty("upload-post", "Não conseguimos consultar esta publicação agora.", { transient: true });
        const views = num(json.views) ?? num(json.impressions);
        const likes = num(json.likes);
        const comments = num(json.comments);
        const shares = num(json.shares);
        return {
          views,
          likes,
          comments,
          shares,
          source: "upload-post",
          available: {
            views: views != null,
            likes: likes != null,
            comments: comments != null,
            shares: shares != null,
          },
          owned: true,
        };
      }
    }

    const token = await getUsableAccessToken(params.account);
    if (params.platform === "TIKTOK") return fetchTikTok(token, params.postExternalId);
    if (params.platform === "YOUTUBE") return fetchYouTube(token, params.postExternalId, params.account.externalAccountId);
    if (params.platform === "INSTAGRAM") return fetchInstagram(token, params.postExternalId);
    return empty(params.platform.toLowerCase(), "As métricas desta plataforma não estão disponíveis automaticamente.", {
      notSupported: true,
    });
  } catch (error) {
    return empty("error", error instanceof Error ? error.message : "Não conseguimos consultar esta publicação agora.", {
      transient: true,
    });
  }
}

async function fetchTikTok(token: string, videoId: string): Promise<FetchedPostMetrics> {
  const response = await tiktokFetch(
    `${TIKTOK_API_BASE}/v2/video/query/?fields=${encodeURIComponent("id,view_count,like_count,comment_count,share_count")}`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ filters: { video_ids: [videoId] } }),
    },
  );
  if (response.status === 429) return empty("tiktok", "Limite da API do TikTok. Tentaremos de novo.", { transient: true });
  if (!response.ok) return empty("tiktok", "Não conseguimos consultar esta publicação agora.", { transient: true });
  const json = (await response.json().catch(() => ({}))) as {
    error?: { code?: string };
    data?: { videos?: Array<{ id?: string; view_count?: number; like_count?: number; comment_count?: number; share_count?: number }> };
  };
  const video = json.data?.videos?.[0];
  if (!video) {
    return { ...empty("tiktok", "Essa publicação não pertence à conta conectada."), owned: false };
  }
  return {
    views: num(video.view_count),
    likes: num(video.like_count),
    comments: num(video.comment_count),
    shares: num(video.share_count),
    source: "tiktok",
    available: {
      views: video.view_count != null,
      likes: video.like_count != null,
      comments: video.comment_count != null,
      shares: video.share_count != null,
    },
    owned: true,
  };
}

async function fetchYouTube(token: string, videoId: string, channelId: string): Promise<FetchedPostMetrics> {
  const url = new URL(`${YOUTUBE_API_BASE}/videos`);
  url.searchParams.set("part", "snippet,statistics");
  url.searchParams.set("id", videoId);
  const response = await youtubeFetch(url.toString(), { headers: { Authorization: `Bearer ${token}` } });
  const json = (await response.json().catch(() => ({}))) as {
    items?: Array<{ snippet?: { channelId?: string }; statistics?: Record<string, string> }>;
  };
  if (response.status === 429) return empty("youtube", "Limite da API do YouTube. Tentaremos de novo.", { transient: true });
  if (!response.ok) return empty("youtube", "Não conseguimos consultar esta publicação agora.", { transient: true });
  const item = json.items?.[0];
  if (!item) return { ...empty("youtube", "Essa publicação não pertence à conta conectada."), owned: false };
  if (item.snippet?.channelId !== channelId) {
    return { ...empty("youtube", "Essa publicação não pertence à conta conectada."), owned: false };
  }
  const stats = item.statistics ?? {};
  const views = stats.viewCount != null ? Number(stats.viewCount) : null;
  const likes = stats.likeCount != null ? Number(stats.likeCount) : null;
  const comments = stats.commentCount != null ? Number(stats.commentCount) : null;
  return {
    views: Number.isFinite(views) ? views : null,
    likes: Number.isFinite(likes) ? likes : null,
    comments: Number.isFinite(comments) ? comments : null,
    shares: null,
    source: "youtube",
    available: {
      views: stats.viewCount != null,
      likes: stats.likeCount != null,
      comments: stats.commentCount != null,
      shares: false,
    },
    owned: true,
  };
}

async function fetchInstagram(token: string, mediaId: string): Promise<FetchedPostMetrics> {
  const response = await metaFetch(
    `${META_GRAPH_BASE}/${encodeURIComponent(mediaId)}/insights?metric=views,likes,comments,shares`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (response.status === 429) return empty("instagram", "Limite da API do Instagram. Tentaremos de novo.", { transient: true });
  const json = (await response.json().catch(() => ({}))) as {
    error?: { message?: string };
    data?: Array<{ name?: string; values?: Array<{ value?: number }> }>;
  };
  if (json.error || !response.ok) {
    return empty("instagram", "As métricas desta plataforma não estão disponíveis automaticamente.", { notSupported: true });
  }
  const byName = Object.fromEntries((json.data ?? []).map((item) => [item.name ?? "", num(item.values?.[0]?.value)]));
  return {
    views: byName.views ?? null,
    likes: byName.likes ?? null,
    comments: byName.comments ?? null,
    shares: byName.shares ?? null,
    source: "instagram",
    available: {
      views: byName.views != null,
      likes: byName.likes != null,
      comments: byName.comments != null,
      shares: byName.shares != null,
    },
    owned: true,
  };
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
