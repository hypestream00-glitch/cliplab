import { enqueueEmail } from "@/lib/email/outbox";
import { isEmailConfigured } from "@/lib/email/config";
import { emailTemplate, type EmailTemplateId, type EmailTemplateVars } from "@/lib/email/templates";

export type SendEmailResult =
  | { ok: true; id: EmailTemplateId; delivered: boolean; duplicate: boolean; queued: boolean; outboxId: string | null }
  | { ok: false; reason: "EMAIL: CONFIGURATION REQUIRED" | "SMTP_SEND_FAILED" | "ENQUEUE_FAILED"; id: EmailTemplateId; queued: boolean; duplicate: false; outboxId: string | null };

export async function sendTemplatedEmail(params: {
  to: string;
  template: EmailTemplateId;
  vars?: EmailTemplateVars;
  userId?: string | null;
  workspaceId?: string | null;
  idempotencyKey?: string;
  rawToken?: string;
  flush?: boolean;
}): Promise<SendEmailResult> {
  const template = emailTemplate(params.template);
  try {
    const queued = await enqueueEmail({
      type: params.template,
      to: params.to,
      userId: params.userId,
      workspaceId: params.workspaceId,
      idempotencyKey: params.idempotencyKey ?? `${params.template}:${params.to}:${Date.now()}`,
      vars: params.vars,
      rawToken: params.rawToken,
      flush: params.flush,
    });
    if (queued.duplicate) {
      return { ok: true, id: template.id, delivered: queued.sent, duplicate: true, queued: false, outboxId: queued.id };
    }
    if (queued.sent) {
      return { ok: true, id: template.id, delivered: true, duplicate: false, queued: true, outboxId: queued.id };
    }
    if (queued.queued && params.flush === false) {
      return { ok: true, id: template.id, delivered: false, duplicate: false, queued: true, outboxId: queued.id };
    }
    if (!isEmailConfigured()) {
      return { ok: false, reason: "EMAIL: CONFIGURATION REQUIRED", id: template.id, queued: queued.queued, duplicate: false, outboxId: queued.id };
    }
    return { ok: false, reason: "SMTP_SEND_FAILED", id: template.id, queued: queued.queued, duplicate: false, outboxId: queued.id };
  } catch {
    return { ok: false, reason: "ENQUEUE_FAILED", id: template.id, queued: false, duplicate: false, outboxId: null };
  }
}

export function canConfirmVerificationResend(
  result: { queued: boolean; duplicate?: boolean },
  configured: boolean,
) {
  return Boolean(result.queued || result.duplicate) && configured;
}

export async function sendVerificationEmail(params: {
  to: string;
  userId: string;
  name?: string | null;
  rawToken: string;
}) {
  return sendTemplatedEmail({
    to: params.to,
    template: "verify-email",
    userId: params.userId,
    vars: { name: params.name ?? undefined },
    rawToken: params.rawToken,
    idempotencyKey: `verify:${params.userId}:${params.rawToken.slice(0, 12)}`,
    flush: false,
  });
}

export async function sendPasswordResetEmail(params: { to: string; userId: string; name?: string | null; rawToken: string }) {
  return sendTemplatedEmail({
    to: params.to,
    template: "password-reset",
    userId: params.userId,
    vars: { name: params.name ?? undefined },
    rawToken: params.rawToken,
    idempotencyKey: `reset:${params.userId}:${params.rawToken.slice(0, 12)}`,
  });
}

export async function sendWelcomeEmail(params: { to: string; userId: string; name?: string | null }) {
  return sendTemplatedEmail({
    to: params.to,
    template: "welcome",
    userId: params.userId,
    vars: { name: params.name ?? undefined },
    idempotencyKey: `welcome:${params.userId}`,
  });
}

export async function sendSubscriptionActivatedEmail(params: {
  to: string;
  userId?: string;
  workspaceId: string;
  planName: string;
  name?: string | null;
  subscriptionId: string;
}) {
  return sendTemplatedEmail({
    to: params.to,
    template: "subscription-activated",
    userId: params.userId,
    workspaceId: params.workspaceId,
    vars: { name: params.name ?? undefined, planName: params.planName },
    idempotencyKey: `sub-activated:${params.subscriptionId}`,
  });
}

export async function sendSubscriptionChangedEmail(params: {
  to: string;
  userId?: string;
  workspaceId: string;
  planName: string;
  name?: string | null;
  subscriptionId: string;
  priceId: string;
}) {
  return sendTemplatedEmail({
    to: params.to,
    template: "subscription-changed",
    userId: params.userId,
    workspaceId: params.workspaceId,
    vars: { name: params.name ?? undefined, planName: params.planName },
    idempotencyKey: `sub-changed:${params.subscriptionId}:${params.priceId}`,
  });
}

export async function sendSubscriptionCanceledEmail(params: {
  to: string;
  userId?: string;
  workspaceId: string;
  name?: string | null;
  subscriptionId: string;
  periodEnd?: string | null;
  ended: boolean;
}) {
  return sendTemplatedEmail({
    to: params.to,
    template: "subscription-canceled",
    userId: params.userId,
    workspaceId: params.workspaceId,
    vars: { name: params.name ?? undefined, periodEnd: params.periodEnd ?? undefined },
    idempotencyKey: params.ended ? `sub-deleted:${params.subscriptionId}` : `sub-cancel-at:${params.subscriptionId}:${params.periodEnd ?? "open"}`,
  });
}

export async function sendPaymentFailedEmail(params: {
  to: string;
  userId?: string;
  workspaceId: string;
  name?: string | null;
  invoiceId: string;
}) {
  return sendTemplatedEmail({
    to: params.to,
    template: "payment-failed",
    userId: params.userId,
    workspaceId: params.workspaceId,
    vars: { name: params.name ?? undefined },
    idempotencyKey: `pay-fail:${params.invoiceId}`,
  });
}
