import "dotenv/config";
import { config } from "dotenv";
import { randomUUID } from "node:crypto";

config({ path: ".env.local", override: true });

function hostOf(url: string) {
  try {
    return new URL(url).host;
  } catch {
    return "invalid-url";
  }
}

function redact(err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  return message
    .replace(/https?:\/\/[^\s'"]+/gi, (value) => `https://${hostOf(value)}/[redacted]`)
    .replace(/[A-Za-z0-9+/]{24,}/g, "[redacted]");
}

function fail(label: string, err?: unknown) {
  console.log(`FAIL ${label}${err ? ` — ${redact(err)}` : ""}`);
  process.exitCode = 1;
}

async function main() {
  const required = ["STORAGE_PROVIDER", "S3_ENDPOINT", "S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"];
  const missing = required.filter((key) => !process.env[key]?.trim());
  if (missing.length) {
    fail("CONFIG — missing env");
    return;
  }
  if (process.env.STORAGE_PROVIDER?.trim() !== "r2") {
    fail("CONFIG — STORAGE_PROVIDER is not r2");
    return;
  }
  if (process.env.S3_BUCKET?.trim() !== "cliplab-media") {
    fail("CONFIG — unexpected bucket");
    return;
  }

  const { getStorage, resetStorageCache } = await import("@/lib/storage");
  resetStorageCache();
  const storage = getStorage();
  if (storage.name !== "r2") {
    fail("PROVIDER");
    return;
  }
  console.log("OK AUTH — provider r2, bucket cliplab-media, private credentials server-side");

  const key = `ws/_probe/direct-upload/${randomUUID()}.txt`;
  const body = Buffer.from("cliplab-direct-upload-cors-probe");
  const origin = "http://localhost:3000";
  let putUrl = "";

  try {
    const signed = await storage.getSignedUploadUrl(key, 120, "text/plain");
    if (signed.method !== "PUT" || signed.expiresAt.getTime() <= Date.now()) {
      throw new Error("invalid signed PUT");
    }
    if (signed.expiresAt.getTime() - Date.now() > 30 * 60 * 1000) {
      throw new Error("signed PUT TTL too long");
    }
    putUrl = signed.url;
    console.log(`OK SIGNED PUT — host ${hostOf(signed.url)} ttl<=120s`);

    const objectUrl = new URL(putUrl);
    objectUrl.search = "";
    let preflight = await fetch(objectUrl.toString(), {
      method: "OPTIONS",
      headers: {
        Origin: origin,
        "Access-Control-Request-Method": "PUT",
        "Access-Control-Request-Headers": "content-type",
      },
    });
    let allowOrigin = preflight.headers.get("access-control-allow-origin");
    if (allowOrigin !== origin) {
      preflight = await fetch(putUrl, {
        method: "OPTIONS",
        headers: {
          Origin: origin,
          "Access-Control-Request-Method": "PUT",
          "Access-Control-Request-Headers": "content-type",
        },
      });
      allowOrigin = preflight.headers.get("access-control-allow-origin");
    }
    const allowMethods = (preflight.headers.get("access-control-allow-methods") ?? "").toUpperCase();
    const allowHeaders = (preflight.headers.get("access-control-allow-headers") ?? "").toLowerCase();
    if (allowOrigin !== origin) {
      throw new Error(`preflight origin ${allowOrigin || preflight.status}`);
    }
    if (allowMethods && !allowMethods.includes("PUT")) throw new Error("preflight methods missing PUT");
    if (allowHeaders && !allowHeaders.includes("content-type") && allowHeaders !== "*") {
      throw new Error("preflight headers missing Content-Type");
    }
    console.log("OK CORS PREFLIGHT — Origin http://localhost:3000 PUT Content-Type");

    const put = await fetch(putUrl, {
      method: "PUT",
      headers: {
        Origin: origin,
        "Content-Type": "text/plain",
      },
      body,
    });
    const putAcao = put.headers.get("access-control-allow-origin");
    if (!put.ok) throw new Error(`PUT status ${put.status}`);
    if (putAcao && putAcao !== origin && putAcao !== "*") throw new Error(`PUT ACAO ${putAcao}`);
    if (putAcao === "*") throw new Error("wildcard CORS origin on PUT");
    console.log("OK CORS PUT — browser-equivalent Origin header accepted");

    const retry = await fetch(putUrl, {
      method: "PUT",
      headers: { Origin: origin, "Content-Type": "text/plain" },
      body,
    });
    if (!retry.ok) throw new Error(`retry PUT status ${retry.status}`);
    console.log("OK PUT RETRY — same signed URL reused before expiry");

    const info = await storage.stat(key);
    if (info.size !== body.length) throw new Error("HEAD size mismatch");
    console.log("OK HEAD VERIFICATION");

    const getSigned = await storage.getSignedUrl(key, 60);
    const got = await fetch(getSigned.url, { headers: { Origin: origin } });
    if (!got.ok) throw new Error(`signed GET status ${got.status}`);
    if ((await got.text()) !== body.toString("utf8")) throw new Error("signed GET payload mismatch");
    console.log("OK SIGNED GET");

    const expired = await storage.getSignedUploadUrl(`${key}.expired`, 1, "text/plain");
    const expiresParam = new URL(expired.url).searchParams.get("X-Amz-Expires");
    if (expiresParam !== "1") throw new Error("short TTL not encoded on signed PUT");
    const tampered = new URL(expired.url);
    tampered.searchParams.set("X-Amz-Signature", "deadbeef");
    const expiredPut = await fetch(tampered.toString(), {
      method: "PUT",
      headers: { Origin: origin, "Content-Type": "text/plain" },
      body,
    });
    if (expiredPut.ok) throw new Error("tampered signed PUT was accepted");
    console.log("OK EXPIRED/INVALID SIGNED PUT — rejected");
  } catch (error) {
    fail("DIRECT UPLOAD", error);
  } finally {
    try {
      await storage.deleteObject(key);
      await storage.deleteObject(`${key}.expired`);
      if (await storage.exists(key)) throw new Error("probe object lingered");
      console.log("OK TEMP DELETE");
    } catch (error) {
      fail("TEMP DELETE", error);
      try {
        await storage.deleteObject(key);
        await storage.deleteObject(`${key}.expired`);
      } catch {
        /* best-effort */
      }
    }
  }

  void putUrl;
}

main().catch((error) => {
  fail("UNEXPECTED", error);
});
