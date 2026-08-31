import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { PLATFORM_LIMITS } from "@/lib/social/platform-limits";
import { TikTokApiError, tiktokFetch } from "@/lib/social/tiktok/http";

const LIMITS = PLATFORM_LIMITS.TIKTOK;

export function planVideoChunks(videoSize: number) {
  if (videoSize <= 0) throw new TikTokApiError("Arquivo de vídeo vazio.", "invalid_video", 400, false);
  if (videoSize > LIMITS.maxFileBytes) {
    throw new TikTokApiError("Vídeo excede 4 GB.", "invalid_video", 400, false);
  }
  if (videoSize < LIMITS.chunkMinBytes) {
    return { chunkSize: videoSize, totalChunkCount: 1 };
  }
  if (videoSize <= LIMITS.chunkMaxBytes) {
    return { chunkSize: videoSize, totalChunkCount: 1 };
  }
  const chunkSize = 10 * 1024 * 1024;
  const totalChunkCount = Math.floor(videoSize / chunkSize);
  return { chunkSize, totalChunkCount: Math.min(LIMITS.maxChunks, Math.max(2, totalChunkCount)) };
}

function chunkRange(index: number, chunkSize: number, videoSize: number, totalChunkCount: number) {
  const start = index * chunkSize;
  const isLast = index === totalChunkCount - 1;
  const end = isLast ? videoSize - 1 : Math.min(videoSize, start + chunkSize) - 1;
  return { start, end, length: end - start + 1 };
}

export async function uploadVideoChunks(params: {
  filePath: string;
  uploadUrl: string;
  videoSize: number;
  chunkSize: number;
  totalChunkCount: number;
  onProgress?: (uploaded: number, total: number) => void;
}) {
  const info = await stat(params.filePath);
  if (info.size !== params.videoSize) {
    throw new TikTokApiError("Tamanho do arquivo mudou durante o upload.", "invalid_video", 400, false);
  }
  for (let i = 0; i < params.totalChunkCount; i++) {
    const range = chunkRange(i, params.chunkSize, params.videoSize, params.totalChunkCount);
    const stream = createReadStream(params.filePath, { start: range.start, end: range.end });
    const response = await tiktokFetch(
      params.uploadUrl,
      {
        method: "PUT",
        headers: {
          "Content-Type": "video/mp4",
          "Content-Length": String(range.length),
          "Content-Range": `bytes ${range.start}-${range.end}/${params.videoSize}`,
        },
        // @ts-expect-error Node fetch stream body
        body: stream,
        duplex: "half",
      },
      { attempts: 3, timeoutMs: 180_000 },
    );
    if (response.status !== 201 && response.status !== 206) {
      const text = await response.text().catch(() => "");
      throw new TikTokApiError(
        text.slice(0, 180) || `Upload TikTok falhou (${response.status}).`,
        "upload_failed",
        response.status,
        response.status >= 500,
      );
    }
    params.onProgress?.(range.end + 1, params.videoSize);
  }
}
