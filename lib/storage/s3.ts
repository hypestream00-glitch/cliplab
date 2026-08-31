import { PassThrough, Readable } from "node:stream";
import { createReadStream, createWriteStream } from "node:fs";
import { stat } from "node:fs/promises";
import type { StorageProvider, SignedUrl } from "@/lib/storage";
import { sanitizeKey } from "@/lib/storage/url";
import { guessObjectMime } from "@/lib/storage/keys";

type Kind = "s3" | "r2" | "b2";

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required for object storage`);
  return value;
}

function forcePathStyle() {
  const raw = process.env.S3_FORCE_PATH_STYLE?.trim().toLowerCase();
  if (raw === "1" || raw === "true" || raw === "yes" || raw === "on") return true;
  if (raw === "0" || raw === "false" || raw === "no" || raw === "off") return false;
  return Boolean(process.env.S3_ENDPOINT?.trim());
}

export function s3Configured() {
  return Boolean(
    process.env.S3_BUCKET?.trim() && process.env.S3_ACCESS_KEY_ID?.trim() && process.env.S3_SECRET_ACCESS_KEY?.trim(),
  );
}

export function createS3Storage(kind: Kind): StorageProvider {
  return new S3Storage(kind);
}

class S3Storage implements StorageProvider {
  name: Kind;
  constructor(kind: Kind) {
    this.name = kind;
  }

  private async client() {
    const { S3Client } = await import("@aws-sdk/client-s3");
    return new S3Client({
      region: process.env.S3_REGION?.trim() || "auto",
      endpoint: process.env.S3_ENDPOINT?.trim() || undefined,
      forcePathStyle: forcePathStyle(),
      credentials: {
        accessKeyId: required("S3_ACCESS_KEY_ID"),
        secretAccessKey: required("S3_SECRET_ACCESS_KEY"),
      },
    });
  }

  getAbsolutePath() {
    return null;
  }

  async ensurePath(): Promise<string> {
    throw new Error("Object storage não usa caminho local. Use withJobTempDir + commitLocalFile.");
  }

  async putObject(key: string, body: Buffer, contentType: string) {
    const { PutObjectCommand } = await import("@aws-sdk/client-s3");
    const client = await this.client();
    await client.send(
      new PutObjectCommand({
        Bucket: required("S3_BUCKET"),
        Key: sanitizeKey(key),
        Body: body,
        ContentType: contentType,
      }),
    );
  }

  async putObjectFromFile(localPath: string, key: string, contentType: string) {
    const { PutObjectCommand } = await import("@aws-sdk/client-s3");
    const client = await this.client();
    const info = await stat(localPath);
    await client.send(
      new PutObjectCommand({
        Bucket: required("S3_BUCKET"),
        Key: sanitizeKey(key),
        Body: createReadStream(localPath),
        ContentLength: info.size,
        ContentType: contentType || guessObjectMime(key),
      }),
    );
  }

  async getObject(key: string) {
    const { GetObjectCommand } = await import("@aws-sdk/client-s3");
    const client = await this.client();
    const result = await client.send(new GetObjectCommand({ Bucket: required("S3_BUCKET"), Key: sanitizeKey(key) }));
    return Buffer.from(await result.Body!.transformToByteArray());
  }

  async deleteObject(key: string) {
    const { DeleteObjectCommand } = await import("@aws-sdk/client-s3");
    const client = await this.client();
    await client.send(new DeleteObjectCommand({ Bucket: required("S3_BUCKET"), Key: sanitizeKey(key) }));
  }

  async getSignedUrl(key: string, expiresSeconds = 900): Promise<SignedUrl> {
    const { GetObjectCommand } = await import("@aws-sdk/client-s3");
    const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
    const client = await this.client();
    const url = await getSignedUrl(
      client,
      new GetObjectCommand({ Bucket: required("S3_BUCKET"), Key: sanitizeKey(key) }),
      { expiresIn: expiresSeconds },
    );
    return { url, method: "GET", expiresAt: new Date(Date.now() + expiresSeconds * 1000) };
  }

  async getSignedUploadUrl(key: string, expiresSeconds = 900, contentType?: string): Promise<SignedUrl> {
    const { PutObjectCommand } = await import("@aws-sdk/client-s3");
    const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
    const client = await this.client();
    const mime = contentType || guessObjectMime(key);
    const url = await getSignedUrl(
      client,
      new PutObjectCommand({
        Bucket: required("S3_BUCKET"),
        Key: sanitizeKey(key),
        ContentType: mime,
      }),
      { expiresIn: expiresSeconds },
    );
    return {
      url,
      method: "PUT",
      expiresAt: new Date(Date.now() + expiresSeconds * 1000),
      headers: { "Content-Type": mime },
    };
  }

  createReadStream(key: string): Readable {
    const pass = new PassThrough();
    void (async () => {
      const { GetObjectCommand } = await import("@aws-sdk/client-s3");
      const client = await this.client();
      const result = await client.send(new GetObjectCommand({ Bucket: required("S3_BUCKET"), Key: sanitizeKey(key) }));
      const body = result.Body as Readable | undefined;
      if (body && typeof body.pipe === "function") {
        body.pipe(pass);
        return;
      }
      const web = result.Body as { transformToWebStream?: () => ReadableStream };
      if (web?.transformToWebStream) {
        Readable.fromWeb(web.transformToWebStream() as import("node:stream/web").ReadableStream).pipe(pass);
        return;
      }
      pass.destroy(new Error("Object storage body stream unavailable"));
    })().catch((error) => pass.destroy(error as Error));
    return pass;
  }

  async createReadStreamRange(key: string, start: number, end: number): Promise<Readable> {
    const { GetObjectCommand } = await import("@aws-sdk/client-s3");
    const client = await this.client();
    const result = await client.send(
      new GetObjectCommand({
        Bucket: required("S3_BUCKET"),
        Key: sanitizeKey(key),
        Range: `bytes=${start}-${end}`,
      }),
    );
    const web = result.Body as { transformToWebStream?: () => ReadableStream };
    if (web?.transformToWebStream) {
      return Readable.fromWeb(web.transformToWebStream() as import("node:stream/web").ReadableStream);
    }
    const buf = Buffer.from(await result.Body!.transformToByteArray());
    return Readable.from(buf);
  }

  async createWriteStream(_key: string): Promise<ReturnType<typeof createWriteStream>> {
    throw new Error("Use putObjectFromFile para object storage.");
  }

  async exists(key: string) {
    try {
      await this.stat(key);
      return true;
    } catch {
      return false;
    }
  }

  async stat(key: string) {
    const { HeadObjectCommand } = await import("@aws-sdk/client-s3");
    const client = await this.client();
    const result = await client.send(new HeadObjectCommand({ Bucket: required("S3_BUCKET"), Key: sanitizeKey(key) }));
    return {
      size: result.ContentLength ?? 0,
      mtime: result.LastModified ?? new Date(),
      contentType: result.ContentType ?? guessObjectMime(key),
    };
  }

  async metadata(key: string) {
    return this.stat(key);
  }
}
