import { createWriteStream } from "node:fs";
import { mkdtemp, rm, copyFile, stat } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { getStorage } from "@/lib/storage";
import { sanitizeKey } from "@/lib/storage/url";
import { guessObjectMime } from "@/lib/storage/keys";

export async function withJobTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(path.join(/* turbopackIgnore: true */ tmpdir(), "cliplab-job-"));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export async function materializeObject(key: string, tempDir: string, name?: string): Promise<string> {
  const storage = getStorage();
  const abs = storage.getAbsolutePath(key);
  if (abs) return abs;
  const dest = path.join(
    /* turbopackIgnore: true */ tempDir,
    name ?? (path.basename(sanitizeKey(key)) || "object.bin"),
  );
  await pipeline(storage.createReadStream(key), createWriteStream(dest));
  return dest;
}

export async function localOutputPath(key: string, tempDir: string, filename: string) {
  const storage = getStorage();
  if (storage.name === "local") return storage.ensurePath(key);
  return path.join(/* turbopackIgnore: true */ tempDir, filename);
}

export async function commitLocalFile(localPath: string, key: string, contentType?: string) {
  const storage = getStorage();
  const localAbs = storage.getAbsolutePath(key);
  if (localAbs) {
    if (path.resolve(localAbs) !== path.resolve(localPath)) {
      await copyFile(localPath, localAbs);
    }
    const info = await stat(localAbs);
    if (!info.size) throw new Error("Arquivo de saída vazio no storage.");
    return;
  }
  const info = await stat(localPath);
  if (!info.size) throw new Error("Arquivo de saída vazio.");
  await storage.putObjectFromFile(localPath, key, contentType ?? guessObjectMime(key));
}

export async function putUploadStream(key: string, stream: NodeJS.ReadableStream, contentType: string) {
  const storage = getStorage();
  if (storage.name === "local") {
    const { pipeline } = await import("node:stream/promises");
    const output = await storage.createWriteStream(key);
    await pipeline(stream, output);
    return key;
  }
  return withJobTempDir(async (dir) => {
    const { pipeline } = await import("node:stream/promises");
    const { createWriteStream } = await import("node:fs");
    const file = path.join(/* turbopackIgnore: true */ dir, "upload.bin");
    await pipeline(stream, createWriteStream(file));
    await storage.putObjectFromFile(file, key, contentType);
    return key;
  });
}

