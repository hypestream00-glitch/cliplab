import { createHmac, randomBytes } from "node:crypto";
import { oauthCallbackUrl } from "@/lib/env/app-url";
import { envTruthy } from "@/lib/env/status";

export const BILIBILI_AUTHORIZE_URL = "https://account.bilibili.com/pc/account-pc/auth/oauth";
export const BILIBILI_TOKEN_URL = "https://api.bilibili.com/x/account-oauth2/v1/token";
export const BILIBILI_USER_INFO_URL = "https://member.bilibili.com/arcopen/fn/user/account/info";

export function bilibiliClientId(source: NodeJS.ProcessEnv = process.env) {
  return source.BILIBILI_CLIENT_ID?.trim() || "";
}

export function bilibiliClientSecret(source: NodeJS.ProcessEnv = process.env) {
  return source.BILIBILI_CLIENT_SECRET?.trim() || "";
}

export function bilibiliRedirectUri() {
  return oauthCallbackUrl();
}

export function isBilibiliConfigured(source: NodeJS.ProcessEnv = process.env) {
  return Boolean(bilibiliClientId(source) && bilibiliClientSecret(source));
}

export function isBilibiliPublishingApproved(source: NodeJS.ProcessEnv = process.env) {
  return envTruthy("ENABLE_BILIBILI_PUBLISHING", source) || envTruthy("BILIBILI_PUBLISHING_APPROVED", source);
}

export function bilibiliOAuthStatus(): "CONFIGURED" | "NOT CONFIGURED" {
  return isBilibiliConfigured() ? "CONFIGURED" : "NOT CONFIGURED";
}

const EMPTY_MD5 = "d41d8cd98f00b204e9800998ecf8427e";

export function bilibiliSignedHeaders(params: { clientId: string; clientSecret: string; accessToken: string }) {
  const nonce = randomBytes(16).toString("base64url");
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const headers: Record<string, string> = {
    "x-bili-accesskeyid": params.clientId,
    "x-bili-content-md5": EMPTY_MD5,
    "x-bili-signature-method": "HMAC-SHA256",
    "x-bili-signature-nonce": nonce,
    "x-bili-signature-version": "2.0",
    "x-bili-timestamp": timestamp,
  };
  const canonical = Object.keys(headers)
    .sort((a, b) => a.localeCompare(b))
    .map((key) => `${key}:${headers[key]}`)
    .join("\n");
  const authorization = createHmac("sha256", params.clientSecret).update(canonical).digest("hex");
  return {
    ...headers,
    Authorization: authorization,
    "access-token": params.accessToken,
    Accept: "application/json",
  };
}
