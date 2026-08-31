import { createHash, randomUUID } from "node:crypto";
import { createReadStream, createWriteStream, existsSync, statSync } from "node:fs";
import { mkdir, readFile, writeFile, unlink, stat, copyFile } from "node:fs/promises";
import path from "node:path";
import type { Readable } from "node:stream";
import { mediaUrl, sanitizeKey } from "@/lib/storage/url";
import { createS3Storage, s3Configured } from "@/lib/storage/s3";
import { guessObjectMime } from "@/lib/storage/keys";

export type SignedUrl = {
  url: string;
  method?: "GET" | "PUT";
  expiresAt: Date;
  headers?: Record<string, string>;
};

export interface StorageProvider {
  name: "local" | "s3" | "r2" | "b2";
  putObject(key: string, body: Buffer, contentType: string): Promise<void>;
  putObjectFromFile(localPath: string, key: string, contentType: string): Promise<void>;
  getObject(key: string): Promise<Buffer>;
  deleteObject(key: string): Promise<void>;
  getSignedUrl(key: string, expiresSeconds?: number): Promise<SignedUrl>;
  getSignedUploadUrl(key: string, expiresSeconds?: number, contentType?: string): Promise<SignedUrl>;
  getAbsolutePath(key: string): string | null;
  createReadStream(key: string): Readable;
  createReadStreamRange?(key: string, start: number, end: number): Promise<Readable> | Readable;
  createWriteStream(key: string): Promise<ReturnType<typeof createWriteStream>>;
  exists(key: string): Promise<boolean>;
  stat(key: string): Promise<{ size: number; mtime: Date; contentType?: string }>;
  metadata(key: string): Promise<{ size: number; mtime: Date; contentType?: string }>;
  ensurePath(key: string): Promise<string>;
}

const ROOT = path.join(process.cwd(), "storage");

export function randomStorageKey(originalName: string, prefix: string) {
  const ext = path.extname(originalName).toLowerCase().slice(0, 8) || ".bin";
  const hash = createHash("sha256").update(randomUUID()).digest("hex").slice(0, 24);
  return `${prefix}/${hash}${ext}`;
}

export function resetStorageCache() {
  cached = null;
}

class LocalStorage implements StorageProvider {
  name = "local" as const;

  abs(key: string) {
    const safe = sanitizeKey(key);
    const root = path.resolve(ROOT);
    const resolved = path.resolve(root, safe);
    const relative = path.relative(root, resolved);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      throw new Error("Storage key fora da pasta permitida.");
    }
    return resolved;
  }

  getAbsolutePath(key: string) {
    return this.abs(key);
  }

  async ensurePath(key: string) {
    const file = this.abs(key);
    await mkdir(path.dirname(file), { recursive: true });
    return file;
  }

  async putObject(key: string, body: Buffer, _contentType: string) {
    const file = this.abs(key);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, body);
  }

  async putObjectFromFile(localPath: string, key: string, _contentType: string) {
    const dest = await this.ensurePath(key);
    if (path.resolve(dest) !== path.resolve(localPath)) {
      await copyFile(localPath, dest);
    }
  }

  async getObject(key: string) {
    return readFile(this.abs(key));
  }

  async deleteObject(key: string) {
    await unlink(this.abs(key)).catch(() => undefined);
  }

  async getSignedUrl(key: string, expiresSeconds = 900): Promise<SignedUrl> {
    return {
      url: `/api/media?key=${encodeURIComponent(sanitizeKey(key))}`,
      method: "GET",
      expiresAt: new Date(Date.now() + expiresSeconds * 1000),
    };
  }

  async getSignedUploadUrl(key: string, expiresSeconds = 900, contentType?: string): Promise<SignedUrl> {
    return {
      url: `/api/media?key=${encodeURIComponent(sanitizeKey(key))}&upload=1`,
      method: "PUT",
      expiresAt: new Date(Date.now() + expiresSeconds * 1000),
      headers: contentType ? { "Content-Type": contentType } : undefined,
    };
  }

  createReadStream(key: string) {
    return createReadStream(this.abs(key));
  }

  createReadStreamRange(key: string, start: number, end: number) {
    return createReadStream(this.abs(key), { start, end });
  }

  async createWriteStream(key: string) {
    const file = this.abs(key);
    await mkdir(path.dirname(file), { recursive: true });
    return createWriteStream(file);
  }

  async exists(key: string) {
    try {
      await stat(this.abs(key));
      return true;
    } catch {
      return false;
    }
  }

  async stat(key: string) {
    const info = statSync(this.abs(key));
    return { size: info.size, mtime: info.mtime, contentType: guessObjectMime(key) };
  }

  async metadata(key: string) {
    return this.stat(key);
  }
}

class UnconfiguredObjectStorage implements StorageProvider {
  name: "s3" | "r2" | "b2";
  constructor(kind: "s3" | "r2" | "b2") {
    this.name = kind;
  }
  private fail(): never {
    throw new Error("Object storage is not configured. Set STORAGE_PROVIDER and S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY.");
  }
  async putObject(): Promise<void> {
    this.fail();
  }
  async putObjectFromFile(): Promise<void> {
    this.fail();
  }
  async getObject(): Promise<Buffer> {
    this.fail();
  }
  async deleteObject(): Promise<void> {
    this.fail();
  }
  async getSignedUrl(): Promise<SignedUrl> {
    this.fail();
  }
  async getSignedUploadUrl(): Promise<SignedUrl> {
    this.fail();
  }
  getAbsolutePath(): string | null {
    return null;
  }
  async ensurePath(): Promise<string> {
    this.fail();
  }
  createReadStream(): Readable {
    this.fail();
  }
  async createWriteStream(): Promise<ReturnType<typeof createWriteStream>> {
    this.fail();
  }
  async exists() {
    return false;
  }
  async stat(_key: string): Promise<{ size: number; mtime: Date; contentType?: string }> {
    this.fail();
  }
  async metadata(key: string) {
    return this.stat(key);
  }
}

class ObjectStorageWithLocalRead implements StorageProvider {
  readonly name: StorageProvider["name"];
  private local = new LocalStorage();

  constructor(private remote: StorageProvider) {
    this.name = remote.name;
  }

  getAbsolutePath(key: string) {
    try {
      const abs = this.local.abs(key);
      if (existsSync(abs)) return abs;
    } catch {
      /* keep remote semantics */
    }
    return this.remote.getAbsolutePath(key);
  }

  async ensurePath(key: string) {
    return this.remote.ensurePath(key);
  }

  putObject(key: string, body: Buffer, contentType: string) {
    return this.remote.putObject(key, body, contentType);
  }

  putObjectFromFile(localPath: string, key: string, contentType: string) {
    return this.remote.putObjectFromFile(localPath, key, contentType);
  }

  async getObject(key: string) {
    if (await this.remote.exists(key)) return this.remote.getObject(key);
    return this.local.getObject(key);
  }

  async deleteObject(key: string) {
    await this.remote.deleteObject(key);
    await this.local.deleteObject(key);
  }

  async getSignedUrl(key: string, expiresSeconds?: number) {
    if (await this.remote.exists(key)) return this.remote.getSignedUrl(key, expiresSeconds);
    return this.local.getSignedUrl(key, expiresSeconds);
  }

  getSignedUploadUrl(key: string, expiresSeconds?: number, contentType?: string) {
    return this.remote.getSignedUploadUrl(key, expiresSeconds, contentType);
  }

  createReadStream(key: string) {
    try {
      const abs = this.local.abs(key);
      if (existsSync(abs)) return this.local.createReadStream(key);
    } catch {
      /* remote */
    }
    return this.remote.createReadStream(key);
  }

  async createReadStreamRange(key: string, start: number, end: number) {
    try {
      const abs = this.local.abs(key);
      if (existsSync(abs)) return this.local.createReadStreamRange(key, start, end);
    } catch {
      /* remote */
    }
    if (this.remote.createReadStreamRange) return this.remote.createReadStreamRange(key, start, end);
    return this.remote.createReadStream(key);
  }

  createWriteStream(key: string) {
    return this.remote.createWriteStream(key);
  }

  async exists(key: string) {
    if (await this.remote.exists(key)) return true;
    return this.local.exists(key);
  }

  async stat(key: string) {
    if (await this.remote.exists(key)) return this.remote.stat(key);
    return this.local.stat(key);
  }

  async metadata(key: string) {
    return this.stat(key);
  }
}

let cached: StorageProvider | null = null;

export function storageProviderName() {
  return (process.env.STORAGE_PROVIDER ?? "local").trim().toLowerCase();
}

export function getStorage(): StorageProvider {
  if (cached) return cached;
  const provider = storageProviderName();
  if (provider === "s3" || provider === "r2" || provider === "b2") {
    cached = s3Configured() ? new ObjectStorageWithLocalRead(createS3Storage(provider)) : new UnconfiguredObjectStorage(provider);
    return cached;
  }
  cached = new LocalStorage();
  return cached;
}

export { mediaUrl, sanitizeKey, ROOT as STORAGE_ROOT };
