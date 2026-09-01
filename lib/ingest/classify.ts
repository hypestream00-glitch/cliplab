import type { SourceKind } from "@/generated/prisma/client";

export type IngestProvider = "YOUTUBE" | "TWITCH" | "KICK" | "TIKTOK" | "INSTAGRAM" | "GOOGLE_DRIVE" | "DIRECT_URL";

export type ClassifiedIngestUrl = {
  provider: IngestProvider;
  sourceKind: SourceKind;
  url: string;
  externalId?: string;
  ingestSupported: boolean;
  metadataSupported: boolean;
  reason?: string;
};

const VIDEO_EXT = /\.(mp4|mov|webm)(?:$|[?#])/i;

function hostOf(url: URL) {
  return url.hostname.replace(/^www\./, "").toLowerCase();
}

export function parseIngestUrl(raw: string): URL {
  const trimmed = raw.trim();
  if (!trimmed) throw new Error("invalid");
  return new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`);
}

export function classifyIngestUrl(raw: string): ClassifiedIngestUrl | null {
  let url: URL;
  try {
    url = parseIngestUrl(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  const host = hostOf(url);
  const href = url.toString();

  if (host === "youtu.be") {
    const id = url.pathname.split("/").filter(Boolean)[0];
    return {
      provider: "YOUTUBE",
      sourceKind: "YOUTUBE",
      url: id ? `https://www.youtube.com/watch?v=${id}` : href,
      externalId: id,
      ingestSupported: false,
      metadataSupported: true,
      reason: "YouTube Data API não oferece download oficial do arquivo.",
    };
  }
  if (host === "youtube.com" || host.endsWith(".youtube.com")) {
    const id = url.searchParams.get("v") || url.pathname.split("/shorts/")[1]?.split("/")[0] || url.pathname.split("/embed/")[1]?.split("/")[0];
    return {
      provider: "YOUTUBE",
      sourceKind: "YOUTUBE",
      url: id ? `https://www.youtube.com/watch?v=${id}` : href,
      externalId: id ?? undefined,
      ingestSupported: false,
      metadataSupported: true,
      reason: "YouTube Data API não oferece download oficial do arquivo.",
    };
  }
  if (host === "twitch.tv" || host.endsWith(".twitch.tv")) {
    const videoId = url.pathname.match(/\/videos\/(\d+)/)?.[1];
    return {
      provider: "TWITCH",
      sourceKind: "TWITCH",
      url: href,
      externalId: videoId,
      ingestSupported: false,
      metadataSupported: true,
      reason: "A API Helix da Twitch não fornece download do VOD.",
    };
  }
  if (host === "kick.com" || host.endsWith(".kick.com")) {
    return {
      provider: "KICK",
      sourceKind: "KICK",
      url: href,
      ingestSupported: false,
      metadataSupported: false,
      reason: "Não há API oficial confiável para importar Kick.",
    };
  }
  if (host === "tiktok.com" || host.endsWith(".tiktok.com")) {
    return {
      provider: "TIKTOK",
      sourceKind: "DIRECT_URL",
      url: href,
      ingestSupported: false,
      metadataSupported: false,
      reason: "Não há API oficial de download do TikTok.",
    };
  }
  if (host === "instagram.com" || host.endsWith(".instagram.com")) {
    return {
      provider: "INSTAGRAM",
      sourceKind: "DIRECT_URL",
      url: href,
      ingestSupported: false,
      metadataSupported: false,
      reason: "Não há API oficial de download do Instagram.",
    };
  }
  if (host === "drive.google.com" || host === "docs.google.com") {
    return {
      provider: "GOOGLE_DRIVE",
      sourceKind: "GOOGLE_DRIVE",
      url: href,
      ingestSupported: false,
      metadataSupported: false,
      reason: "Google Drive ainda não é suportado.",
    };
  }
  const looksLikeDirectFile = VIDEO_EXT.test(url.pathname) || VIDEO_EXT.test(href);
  return {
    provider: "DIRECT_URL",
    sourceKind: "DIRECT_URL",
    url: href,
    ingestSupported: true,
    metadataSupported: true,
    reason: looksLikeDirectFile ? undefined : "Confirme o tipo do arquivo ao analisar o link.",
  };
}

export function providerLabel(provider: IngestProvider) {
  switch (provider) {
    case "YOUTUBE":
      return "YouTube";
    case "TWITCH":
      return "Twitch";
    case "KICK":
      return "Kick";
    case "TIKTOK":
      return "TikTok";
    case "INSTAGRAM":
      return "Instagram";
    case "GOOGLE_DRIVE":
      return "Google Drive";
    default:
      return "Arquivo direto";
  }
}
