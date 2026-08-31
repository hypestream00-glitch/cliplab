import { createReadStream } from "node:fs";
import { YOUTUBE_UPLOAD_URL } from "@/lib/social/youtube/config";
import { YouTubeApiError, parseYouTubeError, youtubeFetch } from "@/lib/social/youtube/http";

/** Official resumable protocol: chunks must be multiples of 256 KiB except the last. 8 MiB is efficient. */
export const YOUTUBE_CHUNK_BYTES = 8 * 1024 * 1024;

async function readJson(response: Response) {
  return (await response.json().catch(() => ({}))) as Record<string, unknown>;
}

export async function startYouTubeResumable(params: {
  accessToken: string;
  videoSize: number;
  mimeType?: string;
  title: string;
  description?: string;
  tags?: string[];
  privacy?: string;
}) {
  const url = `${YOUTUBE_UPLOAD_URL}?uploadType=resumable&part=${encodeURIComponent("snippet,status")}`;
  const response = await youtubeFetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.accessToken}`,
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Length": String(params.videoSize),
      "X-Upload-Content-Type": params.mimeType ?? "video/mp4",
    },
    body: JSON.stringify({
      snippet: {
        title: params.title.slice(0, 100),
        description: (params.description ?? "").slice(0, 5000),
        tags: (params.tags ?? []).slice(0, 30),
        categoryId: "22",
      },
      status: {
        privacyStatus: params.privacy && ["public", "unlisted", "private"].includes(params.privacy) ? params.privacy : "public",
        selfDeclaredMadeForKids: false,
      },
    }),
  });
  if (!response.ok) throw parseYouTubeError(await readJson(response), response.status);
  const location = response.headers.get("location");
  if (!location) throw new YouTubeApiError("YouTube não retornou URI resumable.", "invalid_response", response.status, false);
  return location;
}

export async function uploadYouTubeChunks(params: {
  accessToken: string;
  uploadUrl: string;
  filePath: string;
  videoSize: number;
  onProgress?: (ratio: number) => void;
}) {
  let offset = 0;
  while (offset < params.videoSize) {
    const end = Math.min(params.videoSize, offset + YOUTUBE_CHUNK_BYTES) - 1;
    const length = end - offset + 1;
    const stream = createReadStream(params.filePath, { start: offset, end });
    const chunks: Buffer[] = [];
    for await (const piece of stream) chunks.push(Buffer.isBuffer(piece) ? piece : Buffer.from(piece));
    const body = Buffer.concat(chunks);
    const response = await youtubeFetch(
      params.uploadUrl,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${params.accessToken}`,
          "Content-Length": String(length),
          "Content-Type": "video/mp4",
          "Content-Range": `bytes ${offset}-${end}/${params.videoSize}`,
        },
        body,
      },
      { attempts: 2, timeoutMs: 180_000 },
    );
    if (response.status === 308) {
      const range = response.headers.get("range");
      const last = range?.split("-")[1];
      offset = last ? Number(last) + 1 : end + 1;
      params.onProgress?.(offset / params.videoSize);
      continue;
    }
    if (response.status === 200 || response.status === 201) {
      const json = await readJson(response);
      const id = String((json as { id?: string }).id ?? "");
      if (!id) throw new YouTubeApiError("Upload concluído sem videoId.", "invalid_response", response.status, false);
      params.onProgress?.(1);
      return id;
    }
    if (response.status >= 500) {
      offset = await queryYouTubeUploadOffset(params.accessToken, params.uploadUrl, params.videoSize);
      continue;
    }
    throw parseYouTubeError(await readJson(response), response.status);
  }
  throw new YouTubeApiError("Upload YouTube interrompido.", "uploadInterrupted", 0, true);
}

export async function queryYouTubeUploadOffset(accessToken: string, uploadUrl: string, videoSize: number) {
  const response = await youtubeFetch(uploadUrl, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Length": "0",
      "Content-Range": `bytes */${videoSize}`,
    },
  });
  if (response.status === 308) {
    const last = response.headers.get("range")?.split("-")[1];
    return last ? Number(last) + 1 : 0;
  }
  return 0;
}
