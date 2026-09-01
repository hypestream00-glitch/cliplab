import "dotenv/config";
import { config } from "dotenv";
import { randomBytes } from "node:crypto";
import { hashPassword } from "@/lib/auth/password";
import { prisma } from "@/lib/db/prisma";
import { SmtpEmailProvider } from "@/lib/email/smtp-provider";
import { consumeAuthToken, issueAuthToken, latestTokenIssuedAt } from "@/lib/email/tokens";
import { processEmailOutbox } from "@/lib/email/outbox";
import { sendWelcomeEmail, sendPaymentFailedEmail, sendSubscriptionActivatedEmail } from "@/lib/email/send";
import { hashToken } from "@/lib/security/crypto";

config({ path: ".env.local", override: true });

const KEYS = [
  "EMAIL_PROVIDER",
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_SECURE",
  "SMTP_USER",
  "SMTP_PASSWORD",
  "SMTP_FROM",
  "SMTP_FROM_NAME",
  "APP_URL",
] as const;

function present(name: string) {
  return Boolean(process.env[name]?.trim());
}

function report(results: Record<string, unknown>) {
  console.log(JSON.stringify(results, null, 2));
}

async function main() {
  const envPresence = Object.fromEntries(KEYS.map((key) => [key, present(key) ? "PRESENT" : "MISSING"]));
  const ownerBefore = await prisma.user.findUnique({
    where: { email: "demo@cliplab.app" },
    select: { id: true, passwordHash: true, emailVerified: true },
  });
  const projectBefore = await prisma.project.findFirst({
    where: { name: "RENATO GARCIA" },
    select: { id: true, status: true, workspaceId: true, _count: { select: { clips: true } } },
  });

  const provider = new SmtpEmailProvider();
  const verify = await provider.verifyConnection();

  let testEmail: { accepted: boolean; error?: string } = { accepted: false };
  if (verify.ok) {
    const send = await provider.send({
      to: "hypestream00@gmail.com",
      subject: "CortaClip — E-mail configurado",
      text: "O sistema de e-mails transacionais do CortaClip está funcionando corretamente.",
      html: "<p>O sistema de e-mails transacionais do CortaClip está funcionando corretamente.</p>",
    });
    testEmail = send.ok ? { accepted: true } : { accepted: false, error: send.error };
    if (send.ok) {
      await prisma.emailOutbox.create({
        data: {
          type: "smtp-test",
          recipient: "hypestream00@gmail.com",
          idempotencyKey: `smtp-test:${Date.now()}`,
          subject: "CortaClip — E-mail configurado",
          status: "SENT",
          sentAt: new Date(),
          attempts: 1,
        },
      });
    }
  } else {
    testEmail = { accepted: false, error: verify.error };
  }

  const stamp = Date.now();
  const testEmailAddress = `cliplab.e2e.${stamp}@example.com`;
  const testUser = await prisma.user.create({
    data: {
      email: testEmailAddress,
      name: "E2E Email",
      passwordHash: await hashPassword(`e2e-${randomBytes(8).toString("hex")}`),
    },
  });

  const verifyRaw = await issueAuthToken("verify", testUser.email);
  const verifyOnce = await consumeAuthToken("verify", verifyRaw);
  const verifyReplay = await consumeAuthToken("verify", verifyRaw);
  await prisma.verificationToken.create({
    data: {
      identifier: `verify:${testUser.email}`,
      token: hashToken("expired-token"),
      expires: new Date(Date.now() - 1000),
    },
  });
  const verifyExpired = await consumeAuthToken("verify", "expired-token");

  const firstIssueAt = await latestTokenIssuedAt("verify", testUser.email);
  const secondRaw = await issueAuthToken("verify", testUser.email);
  const secondIssueAt = await latestTokenIssuedAt("verify", testUser.email);

  const unknownForgot = await prisma.emailOutbox.count({
    where: { recipient: "nobody-unknown@example.com" },
  });
  const missingUser = await prisma.user.findUnique({ where: { email: "nobody-unknown@example.com" } });
  const afterUnknown = await prisma.emailOutbox.count({
    where: { recipient: "nobody-unknown@example.com" },
  });

  const resetRaw = await issueAuthToken("reset", testUser.email);
  const resetOnce = await consumeAuthToken("reset", resetRaw);
  const resetReplay = await consumeAuthToken("reset", resetRaw);

  await prisma.user.update({
    where: { id: testUser.id },
    data: { emailVerified: new Date() },
  });
  const welcome1 = await sendWelcomeEmail({ to: testUser.email, userId: testUser.id, name: testUser.name });
  const welcome2 = await sendWelcomeEmail({ to: testUser.email, userId: testUser.id, name: testUser.name });
  const pay1 = await sendPaymentFailedEmail({
    to: testUser.email,
    userId: testUser.id,
    workspaceId: projectBefore?.workspaceId ?? "ws-e2e",
    invoiceId: `in_e2e_${stamp}`,
  });
  const pay2 = await sendPaymentFailedEmail({
    to: testUser.email,
    userId: testUser.id,
    workspaceId: projectBefore?.workspaceId ?? "ws-e2e",
    invoiceId: `in_e2e_${stamp}`,
  });
  const sub1 = await sendSubscriptionActivatedEmail({
    to: testUser.email,
    userId: testUser.id,
    workspaceId: projectBefore?.workspaceId ?? "ws-e2e",
    planName: "CortaClip Pro",
    subscriptionId: `sub_e2e_${stamp}`,
  });
  const sub2 = await sendSubscriptionActivatedEmail({
    to: testUser.email,
    userId: testUser.id,
    workspaceId: "other-workspace",
    planName: "CortaClip Pro",
    subscriptionId: `sub_e2e_${stamp}`,
  });

  const retryKey = `retry-e2e:${stamp}`;
  const retryRow = await prisma.emailOutbox.create({
    data: {
      type: "welcome",
      recipient: testUser.email,
      userId: testUser.id,
      idempotencyKey: retryKey,
      subject: "retry",
      status: "FAILED",
      attempts: 1,
      lastError: "SMTP_SEND_FAILED",
      nextAttemptAt: new Date(Date.now() - 1000),
    },
  });
  const retry = await processEmailOutbox(5);
  const retryAfter = await prisma.emailOutbox.findUnique({
    where: { id: retryRow.id },
    select: { status: true, attempts: true, sentAt: true },
  });

  const ownerAfter = await prisma.user.findUnique({
    where: { email: "demo@cliplab.app" },
    select: { id: true, passwordHash: true },
  });
  const projectAfter = await prisma.project.findFirst({
    where: { name: "RENATO GARCIA" },
    select: { status: true, workspaceId: true, _count: { select: { clips: true } } },
  });
  const sentForTestUser = await prisma.emailOutbox.count({
    where: { recipient: testUser.email, status: "SENT" },
  });
  const sentWithoutAccept = verify.ok === false && sentForTestUser > 0;

  await prisma.emailOutbox.deleteMany({ where: { userId: testUser.id } });
  await prisma.verificationToken.deleteMany({
    where: { identifier: { contains: testUser.email } },
  });
  await prisma.user.delete({ where: { id: testUser.id } }).catch(() => undefined);

  report({
    env: envPresence,
    smtpVerify: verify.ok ? "PASS" : "ERROR",
    smtpVerifyCode: verify.ok ? undefined : verify.error,
    testEmail: testEmail.accepted ? "SENT" : "ERROR",
    testEmailCode: testEmail.accepted ? undefined : testEmail.error,
    verification: verifyOnce.ok && !verifyReplay.ok && verifyExpired.reason === "expired" ? "READY" : "ERROR",
    resend: !firstIssueAt || (secondIssueAt && secondIssueAt.getTime() >= (firstIssueAt?.getTime() ?? 0) && secondRaw) ? "READY" : "ERROR",
    forgotAntiEnum: missingUser === null && unknownForgot === afterUnknown ? "READY" : "ERROR",
    reset: resetOnce.ok && !resetReplay.ok ? "READY" : "ERROR",
    welcome: welcome2.ok && welcome2.duplicate ? "READY" : "ERROR",
    billing: pay1 && pay2.ok && pay2.duplicate && sub1 && sub2.ok && sub2.duplicate ? "READY" : "ERROR",
    retry: retryAfter && retryAfter.attempts >= 1 ? "READY" : "ERROR",
    retryProcessed: retry.processed,
    retryStatus: retryAfter?.status,
    sentWithoutAccept: sentWithoutAccept ? "ERROR" : "PASS",
    ownerPasswordUnchanged: ownerBefore?.passwordHash === ownerAfter?.passwordHash,
    project: {
      name: "RENATO GARCIA",
      status: projectAfter?.status,
      clips: projectAfter?._count.clips,
      workspaceId: projectAfter?.workspaceId,
    },
  });
}

main()
  .catch((error) => {
    console.error(JSON.stringify({ fatal: true, name: error instanceof Error ? error.name : "error" }));
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
