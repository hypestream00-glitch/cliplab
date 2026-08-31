import { NextRequest } from "next/server";
import { Readable } from "node:stream";
import { createReadStream } from "node:fs";
import { getStorage } from "@/lib/storage";
import { sanitizeKey } from "@/lib/storage/url";
import { verifyMetaMedia } from "@/lib/social/meta/media-url";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const key = sanitizeKey(request.nextUrl.searchParams.get("key") ?? "");
  const exp = Number(request.nextUrl.searchParams.get("exp") ?? "0");
  const sig = request.nextUrl.searchParams.get("sig") ?? "";
  if (!key || !verifyMetaMedia(key, exp, sig)) {
    return new Response("URL inválida ou expirada", { status: 403 });
  }
  const storage = getStorage();
  if (!(await storage.exists(key))) return new Response("Arquivo ausente", { status: 404 });
  const info = await storage.stat(key);
  const abs = storage.getAbsolutePath(key);
  const headers = new Headers({
    "Content-Type": "video/mp4",
    "Content-Length": String(info.size),
    "Cache-Control": "private, max-age=60",
    "User-Agent-Allowed": "facebookexternalhit",
  });
  if (!abs) {
    const buf = await storage.getObject(key);
    return new Response(new Uint8Array(buf), { status: 200, headers });
  }
  const stream = createReadStream(abs);
  return new Response(Readable.toWeb(stream) as ReadableStream, { status: 200, headers });
}
