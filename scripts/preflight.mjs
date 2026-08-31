import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
require("dotenv").config({ path: path.join(process.cwd(), ".env") });
require("dotenv").config({ path: path.join(process.cwd(), ".env.local"), override: true });

function present(name) {
  return Boolean(process.env[name]?.trim());
}

function line(label, ok, detail) {
  const mark = ok === true ? "OK" : ok === "warn" ? "WARN" : "MISSING";
  console.log(`${mark.padEnd(7)} ${label}${detail ? ` — ${detail}` : ""}`);
}

console.log("CLIPLAB preflight (no secrets printed)\n");

const nodeMajor = Number(process.versions.node.split(".")[0]);
line("Node.js", nodeMajor >= 20, process.versions.node);

line("DATABASE_URL", present("DATABASE_URL"), present("DATABASE_URL") ? "set" : "required");
if (present("DATABASE_URL")) {
  try {
    const { Client } = require("pg");
    const client = new Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 2500 });
    await client.connect();
    await client.query("SELECT 1");
    await client.end();
    line("Database ping", true, "responding");
  } catch {
    line("Database ping", false, "connection failed");
  }
}

const ffmpeg = spawnSync("ffmpeg", ["-version"], { encoding: "utf8" });
const ffprobe = spawnSync("ffprobe", ["-version"], { encoding: "utf8" });
line("FFmpeg", ffmpeg.status === 0, ffmpeg.status === 0 ? "found" : "not in PATH");
line("ffprobe", ffprobe.status === 0, ffprobe.status === 0 ? "found" : "not in PATH");

const prod = process.env.NODE_ENV === "production";
const storageProvider = (process.env.STORAGE_PROVIDER ?? "local").toLowerCase();
if (storageProvider === "local") {
  line("Storage", prod ? false : "warn", prod ? "FAIL — local disk not allowed in production" : "LOCAL FALLBACK (disk)");
} else {
  const s3ok = present("S3_BUCKET") && present("S3_ACCESS_KEY_ID") && present("S3_SECRET_ACCESS_KEY");
  line("Storage S3", s3ok, s3ok ? "S3 CONNECTED" : "CONFIGURATION REQUIRED — S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY");
  line(
    "Direct upload",
    s3ok,
    s3ok ? "SIGNED PUT READY" : "CONFIGURATION REQUIRED — object storage for browser → R2",
  );
}

line("Redis", present("REDIS_URL") ? true : prod ? false : "warn", present("REDIS_URL") ? "CONNECTED" : prod ? "FAIL — REDIS_URL required in production" : "LOCAL FALLBACK");
let workerFresh = false;
try {
  const stamp = Number(readFileSync(path.join(tmpdir(), "cliplab-worker-heartbeat"), "utf8").trim());
  workerFresh = Number.isFinite(stamp) && Date.now() - stamp < 45_000;
} catch {
  workerFresh = false;
}
if (prod) {
  line("Worker", workerFresh, workerFresh ? "CONNECTED" : "FAIL — npm run worker required");
} else {
  line("Worker", workerFresh ? true : "warn", workerFresh ? "CONNECTED" : "NOT RUNNING (embedded Next workers ok in dev)");
}
line("Queue", present("REDIS_URL") ? true : prod ? false : "warn", present("REDIS_URL") ? "READY" : prod ? "ERROR" : "READY (local fallback)");
line("AUTH_SECRET", present("AUTH_SECRET"), present("AUTH_SECRET") ? "set" : "run npm run preflight after ensure-local-secrets");
line("ENCRYPTION_KEY", present("ENCRYPTION_KEY"), present("ENCRYPTION_KEY") ? "set" : "missing");
line("OpenAI", present("OPENAI_API_KEY") ? true : process.env.NODE_ENV === "production" ? false : "warn", present("OPENAI_API_KEY") ? "CONFIGURED" : process.env.NODE_ENV === "production" ? "REQUIRED IN PRODUCTION" : "NOT CONFIGURED");
line("Social provider", true, process.env.SOCIAL_PROVIDER?.trim() || "upload-post");
const uploadConfigured = present("UPLOAD_POST_API_KEY");
line("Upload-Post", uploadConfigured ? true : "warn", uploadConfigured ? "CONFIGURED" : "NOT CONFIGURED");
const nativeOn = (process.env.SOCIAL_PROVIDER ?? "upload-post").trim() === "native";
line("Native social providers", true, nativeOn ? "OPTIONAL" : "DISABLED");
line("Stripe mode", present("STRIPE_SECRET_KEY") ? true : "warn", present("STRIPE_SECRET_KEY") ? "key present (prefix not printed)" : "CONFIGURATION REQUIRED");
line("Stripe publishable", present("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY") || present("STRIPE_PUBLISHABLE_KEY") ? true : "warn", "set or missing");
line("Stripe webhook", present("STRIPE_WEBHOOK_SECRET") ? true : "warn", present("STRIPE_WEBHOOK_SECRET") ? "set" : "CONFIGURATION REQUIRED");
line("Creator price", present("STRIPE_PRICE_CREATOR") || present("STRIPE_PRICE_PLUS") || present("STRIPE_PRICE_BASIC") ? true : "warn", "set or missing");
line("Pro price", present("STRIPE_PRICE_PRO") || present("STRIPE_PRICE_BUSINESS") ? true : "warn", "set or missing");
const smtpPassword = (process.env.SMTP_PASSWORD ?? "").trim().replace(/\s+/g, "");
const smtpPasswordPlaceholder = ["COLE_AQUI_A_SENHA_DE_APP_DE_16_CARACTERES", "changeme", "password", "your_password_here"].includes(smtpPassword);
const smtpReady = present("SMTP_HOST") && present("SMTP_FROM") && present("SMTP_USER") && present("SMTP_PASSWORD") && !smtpPasswordPlaceholder;
const smtpMissing = ["SMTP_HOST", "SMTP_FROM", "SMTP_USER", "SMTP_PASSWORD"].filter((key) => {
  if (key === "SMTP_PASSWORD") return !present(key) || smtpPasswordPlaceholder;
  return !present(key);
});
line("SMTP", smtpReady ? true : "warn", smtpReady ? "CONFIGURED" : `CONFIGURATION REQUIRED${smtpMissing.length ? " — " + smtpMissing.join(", ") : ""}`);
line("Local storage dir", storageProvider !== "local" || existsSync(path.join(process.cwd(), "storage")) ? true : "warn", "storage/");
const appRaw = process.env.APP_URL?.trim() || process.env.AUTH_URL?.trim() || "";
let appOk = present("APP_URL") || present("AUTH_URL");
let appDetail = appOk ? "set" : "set AUTH_URL or APP_URL";
if (prod) {
  try {
    const parsed = new URL(appRaw);
    const local = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
    appOk = parsed.protocol === "https:" && !local;
    appDetail = appOk ? "https public" : "FAIL — production requires public HTTPS APP_URL";
  } catch {
    appOk = false;
    appDetail = "FAIL — production requires public HTTPS APP_URL";
  }
}
line("APP_URL", prod ? appOk : appOk ? true : "warn", appDetail);
line(
  "Upload max bytes",
  true,
  process.env.MAX_VIDEO_UPLOAD_BYTES?.trim() || "default 10GB ∩ plan limit",
);

console.log("\nNo publish, checkout, or OpenAI spend was performed.");
