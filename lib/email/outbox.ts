import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/logger";
import { isPrismaUniqueViolation } from "@/lib/webhooks/idempotency";
import { encryptSecret, decryptSecret } from "@/lib/security/crypto";
import { isEmailConfigured } from "@/lib/email/config";
import { sendEmail } from "@/lib/email/send-email";
import { renderEmailTemplate, type EmailTemplateId, type EmailTemplateVars } from "@/lib/email/templates";
import {
  isUsablePublicActionUrl,
  passwordResetEmailUrl,
  verificationEmailUrl,
} from "@/lib/email/app-url";
import { withTimeout, safeErrorType } from "@/lib/async/timeout";
import { isPublicHttpsUrl } from "@/lib/env/app-url";
import type { Prisma } from "@/generated/prisma/client";

export type EnqueueEmailInput = {
  type: EmailTemplateId;
  to: string;
  userId?: string | null;
  workspaceId?: string | null;
  idempotencyKey: string;
  vars?: EmailTemplateVars;
  rawToken?: string;
  /** Signup must not wait on SMTP. Worker `processEmailOutbox` delivers later. */
  flush?: boolean;
};

function sanitizeError(value: string) {
  return value.replace(/pass(word)?=[^&\s]+/gi, "pass=[redacted]").slice(0, 180);
}

function backoffMs(attempts: number) {
  return Math.min(60 * 60 * 1000, 30_000 * 2 ** Math.max(0, attempts));
}

function withActionUrl(type: EmailTemplateId, vars: EmailTemplateVars, rawToken?: string): EmailTemplateVars {
  if (type !== "verify-email" && type !== "password-reset") {
    if (vars.actionUrl && isPublicHttpsUrl(vars.actionUrl)) return vars;
    return vars;
  }
  if (vars.actionUrl && isUsablePublicActionUrl(vars.actionUrl)) return vars;
  if (!rawToken) return vars;
  const rebuilt = type === "verify-email" ? verificationEmailUrl(rawToken) : passwordResetEmailUrl(rawToken);
  if (isUsablePublicActionUrl(rebuilt)) return { ...vars, actionUrl: rebuilt };
  if (vars.actionUrl && isPublicHttpsUrl(vars.actionUrl)) return vars;
  logger.warn({ type }, "EMAIL ACTION URL ORIGIN NOT PUBLIC");
  return { ...vars, actionUrl: rebuilt };
}

export async function enqueueEmail(input: EnqueueEmailInput) {
  const vars = input.vars ?? {};
  const varsWithUrl = withActionUrl(input.type, vars, input.rawToken);
  const rendered = renderEmailTemplate(input.type, varsWithUrl);
  const payload: Record<string, string> = {};
  if (varsWithUrl.name) payload.name = varsWithUrl.name;
  if (varsWithUrl.planName) payload.planName = varsWithUrl.planName;
  if (varsWithUrl.periodEnd) payload.periodEnd = varsWithUrl.periodEnd;
  if (varsWithUrl.actionUrl) payload.actionUrl = varsWithUrl.actionUrl;
  if (varsWithUrl.amountLabel) payload.amountLabel = varsWithUrl.amountLabel;
  if (varsWithUrl.reason) payload.reason = varsWithUrl.reason;
  if (input.rawToken) {
    try {
      payload.tokenCipher = encryptSecret(input.rawToken);
    } catch {
      logger.warn({ type: input.type }, "EMAIL VERIFY TOKEN CIPHER SKIPPED");
    }
  }
  try {
    const existing = await prisma.emailOutbox.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
      select: { id: true, status: true },
    });
    if (existing) {
      return {
        queued: false as const,
        duplicate: true as const,
        id: existing.id,
        sent: existing.status === "SENT",
      };
    }
    const row = await prisma.emailOutbox.create({
      data: {
        type: input.type,
        recipient: input.to.toLowerCase(),
        userId: input.userId ?? null,
        workspaceId: input.workspaceId ?? null,
        idempotencyKey: input.idempotencyKey,
        subject: rendered.subject,
        payload: payload as Prisma.InputJsonValue,
        status: "PENDING",
        nextAttemptAt: new Date(),
      },
    });
    logger.info({ type: input.type, outboxId: row.id }, input.type === "verify-email" ? "EMAIL VERIFY QUEUED" : "EMAIL QUEUED");
    if (input.flush !== false) {
      try {
        await withTimeout(flushEmail(row.id), 8_000, "email flush");
      } catch (error) {
        logger.warn({ type: input.type, errType: safeErrorType(error) }, "EMAIL SMTP ERROR: Timeout");
      }
    }
    const latest = await prisma.emailOutbox.findUnique({ where: { id: row.id }, select: { status: true } });
    return {
      queued: true as const,
      duplicate: false as const,
      id: row.id,
      sent: latest?.status === "SENT",
    };
  } catch (error) {
    if (isPrismaUniqueViolation(error)) {
      return { queued: false as const, duplicate: true as const, id: null, sent: false as const };
    }
    throw error;
  }
}

export async function flushEmail(id: string) {
  const row = await prisma.emailOutbox.findUnique({ where: { id } });
  if (!row || row.status === "SENT") return { sent: row?.status === "SENT" };
  if (!isEmailConfigured()) {
    await prisma.emailOutbox.update({
      where: { id },
      data: { lastError: "EMAIL: CONFIGURATION REQUIRED" },
    });
    logger.warn("EMAIL SMTP ERROR: CONFIGURATION_REQUIRED");
    return { sent: false, reason: "EMAIL: CONFIGURATION REQUIRED" as const };
  }
  await prisma.emailOutbox.update({
    where: { id },
    data: { status: "SENDING" },
  });
  const payload = (row.payload ?? {}) as EmailTemplateVars & { tokenCipher?: string };
  let rawToken: string | undefined;
  if (typeof payload.tokenCipher === "string") {
    try {
      rawToken = decryptSecret(payload.tokenCipher);
    } catch {
      rawToken = undefined;
    }
  }
  const vars: EmailTemplateVars = {
    name: payload.name,
    planName: payload.planName,
    periodEnd: payload.periodEnd,
    actionUrl: payload.actionUrl,
    amountLabel: payload.amountLabel,
    reason: payload.reason,
  };
  const rendered = renderEmailTemplate(row.type as EmailTemplateId, withActionUrl(row.type as EmailTemplateId, vars, rawToken));
  const result = await sendEmail({
    to: row.recipient,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
  });
  if (result.ok) {
    const safePayload = { ...payload };
    delete safePayload.tokenCipher;
    await prisma.emailOutbox.update({
      where: { id },
      data: {
        status: "SENT",
        sentAt: new Date(),
        lastError: null,
        payload: safePayload as Prisma.InputJsonValue,
        attempts: row.attempts + 1,
      },
    });
    logger.info({ type: row.type, toHost: row.recipient.split("@")[1] ?? "unknown" }, "email sent");
    return { sent: true as const };
  }
  const attempts = row.attempts + 1;
  const failed = attempts >= 8;
  await prisma.emailOutbox.update({
    where: { id },
    data: {
      status: failed ? "FAILED" : "PENDING",
      attempts,
      lastError: sanitizeError(result.error),
      nextAttemptAt: new Date(Date.now() + backoffMs(attempts)),
    },
  });
  logger.warn(`EMAIL SMTP ERROR: ${result.error}`);
  return { sent: false as const, reason: result.error };
}

export async function processEmailOutbox(limit = 20) {
  if (!isEmailConfigured()) {
    const pending = (await prisma.emailOutbox.count({
      where: { status: { in: ["PENDING", "SENDING"] } },
    })) ?? 0;
    if (pending > 0) logger.warn("EMAIL SMTP ERROR: CONFIGURATION_REQUIRED");
    return { processed: 0, reason: "EMAIL: CONFIGURATION REQUIRED" as const };
  }
  const now = new Date();
  const staleSending = new Date(now.getTime() - 120_000);
  const due = await prisma.emailOutbox.findMany({
    where: {
      attempts: { lt: 8 },
      OR: [
        { status: { in: ["PENDING", "FAILED"] }, nextAttemptAt: { lte: now } },
        { status: "SENDING", updatedAt: { lte: staleSending } },
      ],
    },
    orderBy: { createdAt: "asc" },
    take: limit,
  });
  for (const row of due) {
    try {
      await flushEmail(row.id);
    } catch (error) {
      logger.warn({ errType: safeErrorType(error), outboxId: row.id }, `EMAIL SMTP ERROR: ${safeErrorType(error)}`);
    }
  }
  return { processed: due.length };
}

export async function emailOutboxStats() {
  const [pending, sending, sent, failed, lastSent, lastFailed] = await Promise.all([
    prisma.emailOutbox.count({ where: { status: "PENDING" } }),
    prisma.emailOutbox.count({ where: { status: "SENDING" } }),
    prisma.emailOutbox.count({ where: { status: "SENT" } }),
    prisma.emailOutbox.count({ where: { status: "FAILED" } }),
    prisma.emailOutbox.findFirst({ where: { status: "SENT" }, orderBy: { sentAt: "desc" }, select: { type: true, sentAt: true } }),
    prisma.emailOutbox.findFirst({ where: { status: "FAILED" }, orderBy: { updatedAt: "desc" }, select: { type: true, updatedAt: true } }),
  ]);
  return { pending, sending, sent, failed, lastSent, lastFailed };
}
