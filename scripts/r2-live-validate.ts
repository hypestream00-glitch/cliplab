import "dotenv/config";
import { config } from "dotenv";
import { randomUUID } from "node:crypto";

config({ path: ".env.local", override: true });

function present(name: string) {
  return Boolean(process.env[name]?.trim());
}

function fail(label: string, err: unknown) {
  const message = err instanceof Error ? err.message.replace(/[A-Za-z0-9+/]{20,}/g, "[redacted]") : "error";
  console.log(`FAIL ${label} — ${message}`);
  process.exitCode = 1;
}

async function main() {
  const required = ["STORAGE_PROVIDER", "S3_ENDPOINT", "S3_REGION", "S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY", "S3_FORCE_PATH_STYLE"];
  const missing = required.filter((key) => !present(key));
  if (missing.length) {
    console.log("FAIL CONFIG — missing", missing.join(", "));
    process.exit(1);
  }
  if (process.env.STORAGE_PROVIDER?.trim() !== "r2") {
    console.log("FAIL CONFIG — STORAGE_PROVIDER is not r2");
    process.exit(1);
  }
  if (process.env.S3_BUCKET?.trim() !== "cliplab-media") {
    console.log("FAIL CONFIG — unexpected bucket name");
    process.exit(1);
  }

  const { getStorage, resetStorageCache } = await import("@/lib/storage");
  resetStorageCache();
  const storage = getStorage();
  if (storage.name !== "r2") {
    console.log(`FAIL PROVIDER — ${storage.name}`);
    process.exit(1);
  }
  console.log("OK AUTH — provider r2, bucket cliplab-media");

  const key = `ws/_probe/${randomUUID()}.txt`;
  const body = Buffer.from("cliplab-r2-probe");
  try {
    await storage.putObject(key, body, "text/plain");
    console.log("OK UPLOAD");
  } catch (error) {
    fail("UPLOAD", error);
    return;
  }

  try {
    const info = await storage.stat(key);
    if (!info.size) throw new Error("empty object");
    console.log("OK HEAD/STAT");
  } catch (error) {
    fail("HEAD/STAT", error);
  }

  try {
    const got = await storage.getObject(key);
    if (got.toString("utf8") !== body.toString("utf8")) throw new Error("payload mismatch");
    console.log("OK DOWNLOAD");
  } catch (error) {
    fail("DOWNLOAD", error);
  }

  try {
    const signed = await storage.getSignedUrl(key, 60);
    const upload = await storage.getSignedUploadUrl(key, 60, "text/plain");
    if (!signed.url.startsWith("https://") || signed.expiresAt.getTime() <= Date.now()) {
      throw new Error("invalid download signed url");
    }
    if (upload.method !== "PUT" || !upload.url.startsWith("https://")) {
      throw new Error("invalid upload signed url");
    }
    const res = await fetch(signed.url);
    if (!res.ok) throw new Error(`signed GET status ${res.status}`);
    const text = await res.text();
    if (text !== body.toString("utf8")) throw new Error("signed GET payload mismatch");
    console.log("OK SIGNED URL");
  } catch (error) {
    fail("SIGNED URL", error);
  }

  try {
    await storage.deleteObject(key);
    const stillThere = await storage.exists(key);
    if (stillThere) throw new Error("object still present after delete");
    console.log("OK DELETE");
  } catch (error) {
    fail("DELETE", error);
    try {
      await storage.deleteObject(key);
    } catch {
      /* best-effort cleanup */
    }
  }
}

main().catch((error) => {
  fail("UNEXPECTED", error);
});
