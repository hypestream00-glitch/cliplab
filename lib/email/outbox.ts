import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/logger";
import { isPrismaUniqueViolation } from "@/lib/webhooks/idempotency";
import { encryptSecret, decryptSecret } from "@/lib/security/crypto";
import { isEmailConfigured } from "@/lib/email/config";
import { getEmailProvider } from "@/lib/email/smtp-provider";
import { renderEmailTemplate, type EmailTemplateId, type EmailTemplateVars } from "@/lib/email/templates";
import { appPathUrl } from "@/lib/email/app-url";
import type { Prisma } from "@/generated/prisma/client";

export type EnqueueEmailInput = {
  type: EmailTemplateId;
  to: string;
  userId?: string | null;
  workspaceId?: string | null;
  idempotencyKey: string;
  vars?: EmailTemplateVars;
  rawToken?: string;
};

function sanitizeError(value: string) {
  return value.replace(/pass(word)?=[^&\s]+/gi, "pass=[redacted]").slice(0, 180);
}

function backoffMs(attempts: number) {
  return Math.min(60 * 60 * 1000, 30_000 * 2 ** Math.max(0, attempts));
}

function withActionUrl(type: EmailTemplateId, vars: EmailTemplateVars, rawToken?: string): EmailTemplateVars {
  if (!rawToken) return vars;
  if (type === "verify-email") return { ...vars, actionUrl: appPathUrl(`/verify-email?token=${encodeURIComponent(rawToken)}`) };
  if (type === "password-reset") return { ...vars, actionUrl: appPathUrl(`/reset-password?token=${encodeURIComponent(rawToken)}`) };
  return vars;
}

export async function enqueueEmail(input: EnqueueEmailInput) {
  const vars = input.vars ?? {};
  const rendered = renderEmailTemplate(input.type, withActionUrl(input.type, vars, input.rawToken));
  const payload: Record<string, string> = {};
  if (vars.name) payload.name = vars.name;
  if (vars.planName) payload.planName = vars.planName;
  if (vars.periodEnd) payload.periodEnd = vars.periodEnd;
  if (vars.actionUrl) payload.actionUrl = vars.actionUrl;
  if (input.rawToken) {
    payload.tokenCipher = encryptSecret(input.rawToken);
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
      },
    });
    await flushEmail(row.id);
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

async function flushEmail(id: string) {
  const row = await prisma.emailOutbox.findUnique({ where: { id } });
  if (!row || row.status === "SENT") return;
  if (!isEmailConfigured()) {
    await prisma.emailOutbox.update({
      where: { id },
      data: { lastError: "EMAIL: CONFIGURATION REQUIRED" },
    });
    return;
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
  };
  const rendered = renderEmailTemplate(row.type as EmailTemplateId, withActionUrl(row.type as EmailTemplateId, vars, rawToken));
  const result = await getEmailProvider().send({
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
    return;
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
}

export async function processEmailOutbox(limit = 20) {
  if (!isEmailConfigured()) {
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
    await flushEmail(row.id);
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
