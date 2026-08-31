export type InfraPreflightInput = {
  nodeEnv?: string;
  storageProvider?: string;
  s3Bucket?: string;
  s3AccessKeyId?: string;
  s3SecretAccessKey?: string;
  redisUrl?: string;
  workerRunning?: boolean;
  appUrl?: string;
};

export type CheckResult = { ok: true | false | "warn"; detail: string };

export type InfraPreflightResult = {
  storage: CheckResult;
  redis: CheckResult;
  worker: CheckResult;
  queue: CheckResult;
  directUpload: CheckResult;
  appUrl: CheckResult;
  productionReady: boolean;
};

function present(value?: string) {
  return Boolean(value?.trim());
}

export function evaluateInfraPreflight(input: InfraPreflightInput): InfraPreflightResult {
  const prod = input.nodeEnv === "production";
  const provider = (input.storageProvider ?? "local").trim().toLowerCase() || "local";

  let storage: CheckResult;
  if (provider === "local") {
    storage = prod
      ? { ok: false, detail: "FAIL — local disk not allowed in production" }
      : { ok: "warn", detail: "LOCAL FALLBACK (disk)" };
  } else {
    const s3ok = present(input.s3Bucket) && present(input.s3AccessKeyId) && present(input.s3SecretAccessKey);
    storage = s3ok
      ? { ok: true, detail: "S3 CONNECTED" }
      : { ok: false, detail: "CONFIGURATION REQUIRED — S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY" };
  }

  let redis: CheckResult;
  if (present(input.redisUrl)) {
    redis = { ok: true, detail: "CONNECTED" };
  } else if (prod) {
    redis = { ok: false, detail: "FAIL — REDIS_URL required in production" };
  } else {
    redis = { ok: "warn", detail: "LOCAL FALLBACK" };
  }

  let worker: CheckResult;
  if (input.workerRunning) {
    worker = { ok: true, detail: "CONNECTED" };
  } else if (prod) {
    worker = { ok: false, detail: "FAIL — npm run worker required" };
  } else {
    worker = { ok: "warn", detail: "NOT RUNNING (embedded Next workers ok in dev)" };
  }

  const queue: CheckResult =
    redis.ok === true
      ? { ok: true, detail: "READY" }
      : prod
        ? { ok: false, detail: "ERROR" }
        : { ok: "warn", detail: "READY" };

  const directUpload: CheckResult =
    provider === "local"
      ? prod
        ? { ok: false, detail: "FAIL — signed PUT requires object storage" }
        : { ok: "warn", detail: "LOCAL PUT via Next stream" }
      : storage.ok === true
        ? { ok: true, detail: "SIGNED PUT READY" }
        : { ok: false, detail: "CONFIGURATION REQUIRED — object storage for browser → R2" };

  let appUrl: CheckResult = { ok: true, detail: "not checked" };
  const rawApp = input.appUrl?.trim();
  if (prod) {
    try {
      const parsed = new URL(rawApp || "");
      const local = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
      appUrl =
        parsed.protocol === "https:" && !local
          ? { ok: true, detail: "https public" }
          : { ok: false, detail: "FAIL — production requires public HTTPS APP_URL" };
    } catch {
      appUrl = { ok: false, detail: "FAIL — production requires public HTTPS APP_URL" };
    }
  } else if (rawApp) {
    appUrl = { ok: true, detail: "set" };
  } else {
    appUrl = { ok: "warn", detail: "set AUTH_URL or APP_URL" };
  }

  const productionReady =
    prod &&
    storage.ok === true &&
    redis.ok === true &&
    worker.ok === true &&
    queue.ok === true &&
    directUpload.ok === true &&
    appUrl.ok === true;

  return { storage, redis, worker, queue, directUpload, appUrl, productionReady };
}
