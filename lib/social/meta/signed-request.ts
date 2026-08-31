import { createHmac, timingSafeEqual } from "node:crypto";
import { metaAppSecret } from "@/lib/social/meta/config";

export function parseSignedRequest(signedRequest: string) {
  const secret = metaAppSecret();
  const [encodedSig, payload] = signedRequest.split(".");
  if (!encodedSig || !payload) return null;
  const expected = createHmac("sha256", secret).update(payload).digest();
  const given = Buffer.from(encodedSig.replace(/-/g, "+").replace(/_/g, "/"), "base64");
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  const json = Buffer.from(payload.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
  return JSON.parse(json) as { user_id?: string; algorithm?: string };
}

export function verifyWebhookSignature(rawBody: string, header: string | null) {
  if (!header?.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", metaAppSecret()).update(rawBody, "utf8").digest("hex");
  const given = header.slice("sha256=".length);
  const left = Buffer.from(expected);
  const right = Buffer.from(given);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
