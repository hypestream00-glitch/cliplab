import { logger } from "@/lib/logger";
import { uploadPostApiBase, uploadPostApiKey } from "@/lib/social/upload-post/config";
import { friendlyUploadPostMessage, UploadPostApiError, UploadPostConfigError, UploadPostPlanError } from "@/lib/social/upload-post/errors";

export type UploadPostHttpRequest = {
  method: string;
  path: string;
  query?: Record<string, string | undefined>;
  json?: unknown;
  form?: FormData;
  headers?: Record<string, string>;
};

export type UploadPostHttpResponse = {
  status: number;
  json: unknown;
  text: string;
};

export type UploadPostHttp = {
  request: (opts: UploadPostHttpRequest) => Promise<UploadPostHttpResponse>;
};

let injected: UploadPostHttp | null = null;

export function setUploadPostHttpForTests(http: UploadPostHttp | null) {
  injected = http;
}

function queryString(query?: Record<string, string | undefined>) {
  if (!query) return "";
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value) params.set(key, value);
  }
  const encoded = params.toString();
  return encoded ? `?${encoded}` : "";
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

export function parseUploadPostError(status: number, json: unknown, fallback: string) {
  const record = asRecord(json);
  const code = typeof record?.error_code === "string" ? record.error_code : undefined;
  const message =
    (typeof record?.message === "string" && record.message) ||
    (typeof record?.error === "string" && record.error) ||
    fallback;
  const friendly = friendlyUploadPostMessage(status, code, message);
  if (status === 403 && (code === "PROFILE_LIMIT_REACHED" || code === "PROFILE_BLOCKED" || code === "READONLY_CALENDAR" || /plan|white.?label|schedul|analytics/i.test(message))) {
    return new UploadPostPlanError(friendly, code);
  }
  return new UploadPostApiError(friendly, status, code);
}

async function realRequest(opts: UploadPostHttpRequest): Promise<UploadPostHttpResponse> {
  const key = uploadPostApiKey();
  if (!key) throw new UploadPostConfigError();
  const url = `${uploadPostApiBase()}${opts.path.startsWith("/") ? opts.path : `/${opts.path}`}${queryString(opts.query)}`;
  const headers: Record<string, string> = {
    Authorization: `Apikey ${key}`,
    ...opts.headers,
  };
  let body: BodyInit | undefined;
  if (opts.form) {
    body = opts.form;
  } else if (opts.json !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(opts.json);
  }
  const response = await fetch(url, { method: opts.method, headers, body });
  const text = await response.text();
  let json: unknown = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = { message: text };
    }
  }
  logger.info({ provider: "upload-post", operation: opts.method, path: opts.path, status: response.status }, "upload-post http");
  if (response.status === 401) {
    const { rememberUploadPostAuthError } = await import("@/lib/social/upload-post/health");
    rememberUploadPostAuthError();
  }
  return { status: response.status, json, text };
}

export async function uploadPostRequest(opts: UploadPostHttpRequest): Promise<UploadPostHttpResponse> {
  if (injected) return injected.request(opts);
  return realRequest(opts);
}

export async function uploadPostJson<T = unknown>(opts: UploadPostHttpRequest): Promise<T> {
  const result = await uploadPostRequest(opts);
  if (result.status >= 400) {
    throw parseUploadPostError(result.status, result.json, `Upload-Post HTTP ${result.status}`);
  }
  return result.json as T;
}
