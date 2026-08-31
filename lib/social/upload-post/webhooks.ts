import { createHmac, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { isPrismaUniqueViolation } from "@/lib/webhooks/idempotency";
import { uploadPostWebhookSecret } from "@/lib/social/upload-post/config";
import { fromUploadPostPlatform } from "@/lib/social/upload-post/platforms";
import { syncUploadPostAccounts } from "@/lib/social/upload-post/accounts";
import { syncUploadPostPublicationStatus } from "@/lib/social/upload-post/publish";
import { logger } from "@/lib/logger";

const MAX_SKEW_SEC = 300;

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export function verifyUploadPostSignature(params: {
  rawBody: string | Buffer;
  timestamp: string;
  signature: string;
  secret: string;
}) {
  const ts = Number(params.timestamp);
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > MAX_SKEW_SEC) return false;
  const provided = params.signature.replace(/^sha256=/, "");
  const body = typeof params.rawBody === "string" ? Buffer.from(params.rawBody) : params.rawBody;
  const expected = createHmac("sha256", params.secret).update(`${params.timestamp}.`).update(body).digest("hex");
  const left = Buffer.from(provided, "hex");
  const right = Buffer.from(expected, "hex");
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export async function handleUploadPostWebhook(params: {
  rawBody: string;
  signature: string | null;
  timestamp: string | null;
  event: string | null;
  deliveryId: string | null;
}) {
  const secret = uploadPostWebhookSecret();
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      return { ok: false, status: 401, error: "Webhook secret required" };
    }
  } else {
    if (!params.signature || !params.timestamp) return { ok: false, status: 401, error: "Assinatura ausente" };
    if (!verifyUploadPostSignature({ rawBody: params.rawBody, timestamp: params.timestamp, signature: params.signature, secret })) {
      return { ok: false, status: 401, error: "Assinatura inválida" };
    }
  }
  const deliveryId = params.deliveryId || `body:${Buffer.from(params.rawBody).toString("base64").slice(0, 80)}`;
  try {
    await prisma.processedWebhookEvent.create({
      data: { id: `upload-post:${deliveryId}`, provider: "upload-post", type: params.event ?? "unknown" },
    });
  } catch (error) {
    if (isPrismaUniqueViolation(error)) return { ok: true, status: 200, duplicate: true };
    throw error;
  }

  const payload = JSON.parse(params.rawBody || "{}") as Record<string, unknown>;
  const event = params.event || String(payload.event ?? payload.type ?? "");
  const username =
    (typeof payload.profile_username === "string" && payload.profile_username) ||
    (typeof payload.username === "string" && payload.username) ||
    (typeof asObject(payload.profile).username === "string" ? String(asObject(payload.profile).username) : "");

  const profile = username
    ? await prisma.uploadPostProfile.findUnique({ where: { username } })
    : null;

  if (event === "upload_completed") {
    const externalId = typeof payload.external_id === "string" ? payload.external_id : null;
    const requestId = typeof payload.request_id === "string" ? payload.request_id : null;
    const jobId = typeof payload.job_id === "string" ? payload.job_id : null;
    const publication = externalId
      ? await prisma.socialPublication.findFirst({ where: { id: externalId, provider: "UPLOAD_POST" } })
      : await prisma.socialPublication.findFirst({
          where: {
            provider: "UPLOAD_POST",
            providerPublicationId: { in: [requestId, jobId].filter((item): item is string => Boolean(item)) },
          },
        });
    if (publication) {
      if (profile && publication.workspaceId !== profile.workspaceId) {
        logger.warn({ publicationId: publication.id }, "upload-post webhook workspace mismatch");
        return { ok: true, status: 200 };
      }
      if (!profile && !secret) {
        logger.warn({ publicationId: publication.id }, "unsigned upload-post webhook without profile skipped");
        return { ok: true, status: 200 };
      }
      await syncUploadPostPublicationStatus(publication.workspaceId, publication.id);
    }
  }

  if (event === "social_account_connected" || event === "social_account_disconnected" || event === "social_account_reauth_required") {
    if (profile) {
      if (event === "social_account_connected") {
        const platform = fromUploadPostPlatform(String(payload.platform ?? ""));
        if (platform) {
          const meta = asObject(profile.metadata);
          const skipped = Array.isArray(meta.disconnectedPlatforms)
            ? (meta.disconnectedPlatforms as unknown[]).filter((item): item is string => typeof item === "string" && item !== platform)
            : [];
          await prisma.uploadPostProfile.update({
            where: { id: profile.id },
            data: { metadata: JSON.parse(JSON.stringify({ ...meta, disconnectedPlatforms: skipped })) },
          });
        }
      }
      await syncUploadPostAccounts(profile.workspaceId);
      if (event === "social_account_reauth_required") {
        const platform = fromUploadPostPlatform(String(payload.platform ?? ""));
        if (platform) {
          await prisma.socialAccount.updateMany({
            where: { workspaceId: profile.workspaceId, provider: "UPLOAD_POST", platform },
            data: { status: "REAUTH_REQUIRED" },
          });
        }
      }
    }
  }

  return { ok: true, status: 200 };
}
