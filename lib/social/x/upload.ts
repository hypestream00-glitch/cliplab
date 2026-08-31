import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { X_API_BASE } from "@/lib/social/x/config";
import { XApiError, parseXError, xFetch } from "@/lib/social/x/http";
import { mapXMediaStatus } from "@/lib/social/x/helpers";

const CHUNK = 4 * 1024 * 1024;

export function planXMediaChunks(videoSize: number) {
  return { chunkSize: CHUNK, totalChunkCount: Math.max(1, Math.ceil(videoSize / CHUNK)) };
}

async function readJson(response: Response) {
  return (await response.json().catch(() => ({}))) as Record<string, unknown>;
}

function mediaIdFrom(json: Record<string, unknown>) {
  const data = json.data as { id?: string; media_id_string?: string } | undefined;
  return String(data?.id ?? data?.media_id_string ?? json.media_id_string ?? json.id ?? "");
}

export async function xInitMediaUpload(accessToken: string, totalBytes: number, mime = "video/mp4") {
  const body = new FormData();
  body.set("command", "INIT");
  body.set("media_type", mime);
  body.set("total_bytes", String(totalBytes));
  body.set("media_category", "tweet_video");
  const response = await xFetch(`${X_API_BASE}/media/upload`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
    body,
  });
  const json = await readJson(response);
  if (!response.ok || json.errors || json.title) throw parseXError(json, response.status);
  const id = mediaIdFrom(json);
  if (!id) throw new XApiError("X não retornou media_id.", "media_upload_failed", response.status, false);
  return id;
}

export async function xAppendMediaChunks(params: {
  accessToken: string;
  mediaId: string;
  filePath: string;
  videoSize: number;
  onProgress?: (ratio: number) => void;
}) {
  const total = Math.max(1, Math.ceil(params.videoSize / CHUNK));
  for (let i = 0; i < total; i++) {
    const start = i * CHUNK;
    const end = Math.min(params.videoSize, start + CHUNK) - 1;
    const stream = createReadStream(params.filePath, { start, end });
    const chunks: Buffer[] = [];
    for await (const piece of stream) chunks.push(Buffer.isBuffer(piece) ? piece : Buffer.from(piece));
    const blob = new Blob([Buffer.concat(chunks)]);
    const body = new FormData();
    body.set("command", "APPEND");
    body.set("media_id", params.mediaId);
    body.set("segment_index", String(i));
    body.set("media", blob, "chunk.mp4");
    const response = await xFetch(`${X_API_BASE}/media/upload`, {
      method: "POST",
      headers: { Authorization: `Bearer ${params.accessToken}` },
      body,
    });
    if (!response.ok) {
      const json = await readJson(response);
      throw parseXError(json, response.status);
    }
    params.onProgress?.((i + 1) / total);
  }
}

export async function xFinalizeMedia(accessToken: string, mediaId: string) {
  const body = new FormData();
  body.set("command", "FINALIZE");
  body.set("media_id", mediaId);
  const response = await xFetch(`${X_API_BASE}/media/upload`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
    body,
  });
  const json = await readJson(response);
  if (!response.ok || json.errors || json.title) throw parseXError(json, response.status);
  const data = (json.data ?? json) as { processing_info?: { state?: string; check_after_secs?: number } };
  return data.processing_info;
}

export async function xMediaStatus(accessToken: string, mediaId: string) {
  const url = new URL(`${X_API_BASE}/media/upload`);
  url.searchParams.set("command", "STATUS");
  url.searchParams.set("media_id", mediaId);
  const response = await xFetch(url.toString(), { headers: { Authorization: `Bearer ${accessToken}` } });
  const json = await readJson(response);
  if (!response.ok || json.errors || json.title) throw parseXError(json, response.status);
  const data = (json.data ?? json) as { processing_info?: { state?: string; check_after_secs?: number; error?: { message?: string } } };
  const info = data.processing_info;
  if (!info) {
    return { status: "PUBLISHED" as const, state: "succeeded", checkAfterSecs: 0, error: undefined };
  }
  return {
    status: mapXMediaStatus(info?.state),
    state: info?.state,
    checkAfterSecs: info?.check_after_secs ?? 5,
    error: info?.error?.message,
  };
}

export async function fileSize(path: string) {
  return (await stat(path)).size;
}
