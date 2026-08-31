import { Readable } from "node:stream";
import { createReadStream } from "node:fs";
import { NextRequest } from "next/server";
import { requireWorkspaceContext } from "@/lib/auth/session";
import { authorizeMediaKey } from "@/lib/media/authorize";
import { getStorage } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function contentDisposition(filename: string, download: boolean) {
  const safe = filename.replace(/[^\w.\-]+/g, "_");
  return `${download ? "attachment" : "inline"}; filename="${safe}"`;
}

export async function GET(request: NextRequest) {
  const ctx = await requireWorkspaceContext();
  const keyParam = request.nextUrl.searchParams.get("key");
  if (!keyParam) {
    return new Response("key ausente", { status: 400 });
  }
  const authorized = await authorizeMediaKey(ctx.workspace.id, keyParam);
  if (!authorized) {
    return new Response("Arquivo não encontrado", { status: 404 });
  }
  const storage = getStorage();
  const exists = await storage.exists(authorized.key);
  if (!exists) {
    return new Response("Arquivo ausente no storage", { status: 404 });
  }
  const info = await storage.stat(authorized.key);
  const download = request.nextUrl.searchParams.get("download") === "1";
  const filename = request.nextUrl.searchParams.get("filename") ?? authorized.key.split("/").pop() ?? "file";
  const abs = storage.getAbsolutePath(authorized.key);
  const range = request.headers.get("range");

  if (!abs && (storage.name === "s3" || storage.name === "r2" || storage.name === "b2") && !range) {
    const ttl = download ? 120 : 900;
    const signed = await storage.getSignedUrl(authorized.key, ttl);
    return Response.redirect(signed.url, 302);
  }

  const headers = new Headers({
    "Content-Type": authorized.mime,
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, max-age=60",
    "Content-Disposition": contentDisposition(filename, download),
  });

  if (range) {
    const match = /bytes=(\d*)-(\d*)/.exec(range);
    const start = match?.[1] ? Number(match[1]) : 0;
    const end = match?.[2] ? Number(match[2]) : info.size - 1;
    if (start >= info.size || end >= info.size || start > end) {
      return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${info.size}` } });
    }
    headers.set("Content-Range", `bytes ${start}-${end}/${info.size}`);
    headers.set("Content-Length", String(end - start + 1));
    const ranged =
      (await storage.createReadStreamRange?.(authorized.key, start, end)) ??
      (abs ? createReadStream(abs, { start, end }) : storage.createReadStream(authorized.key));
    return new Response(Readable.toWeb(ranged as Readable) as ReadableStream, { status: 206, headers });
  }

  headers.set("Content-Length", String(info.size));
  const stream = abs ? createReadStream(abs) : storage.createReadStream(authorized.key);
  return new Response(Readable.toWeb(stream as Readable) as ReadableStream, { status: 200, headers });
}
