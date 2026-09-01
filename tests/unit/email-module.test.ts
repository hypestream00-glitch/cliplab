import { afterEach, describe, expect, it, vi } from "vitest";
import { escapeHtml, maskEmail } from "@/lib/email/escape";
import { appOrigin, appPathUrl, isSafeAppPath } from "@/lib/email/app-url";
import { emailMissingVars, emailProviderStatus, isEmailConfigured, logEmailProviderPresence, logSmtpEnvPresence, smtpSafeEnvCheck } from "@/lib/email/config";
import { canConfirmVerificationResend } from "@/lib/email/send";
import { smtpFailureCode } from "@/lib/email/smtp-provider";
import { LOG_REDACT_PATHS, logger } from "@/lib/logger";
import { renderEmailTemplate } from "@/lib/email/templates";
import { hashToken } from "@/lib/security/crypto";

const create = vi.fn();
const findFirst = vi.fn();
const deleteMany = vi.fn();
const update = vi.fn();
const findUnique = vi.fn();
const findMany = vi.fn();
const count = vi.fn();

const sendMock = vi.fn(async (): Promise<{ ok: true } | { ok: false; error: string }> => ({
  ok: false,
  error: "SMTP_SEND_FAILED",
}));

const SMTP_KEYS = [
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_SECURE",
  "SMTP_USER",
  "SMTP_PASSWORD",
  "SMTP_PASS",
  "SMTP_FROM",
  "EMAIL_FROM",
  "RESEND_API_KEY",
] as const;

function snapshotSmtpEnv() {
  return Object.fromEntries(SMTP_KEYS.map((key) => [key, process.env[key]]));
}

function restoreSmtpEnv(prev: Record<string, string | undefined>) {
  for (const key of SMTP_KEYS) {
    if (prev[key]) process.env[key] = prev[key];
    else delete process.env[key];
  }
}

function clearSmtpEnv() {
  for (const key of SMTP_KEYS) delete process.env[key];
}

function setSmtpConfigured() {
  process.env.SMTP_HOST = "smtp.gmail.com";
  process.env.SMTP_PORT = "587";
  process.env.SMTP_SECURE = "false";
  process.env.SMTP_USER = "from@example.com";
  process.env.SMTP_PASSWORD = "app-password-not-logged";
  process.env.SMTP_FROM = "from@example.com";
}

vi.mock("@/lib/email/send-email", () => ({
  sendEmail: () => sendMock(),
  getEmailProvider: () => ({
    name: "smtp",
    send: () => sendMock(),
  }),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    verificationToken: {
      create: (...args: unknown[]) => create(...args),
      findFirst: (...args: unknown[]) => findFirst(...args),
      deleteMany: (...args: unknown[]) => deleteMany(...args),
    },
    emailOutbox: {
      create: (...args: unknown[]) => create(...args),
      findUnique: (...args: unknown[]) => findUnique(...args),
      findMany: (...args: unknown[]) => findMany(...args),
      update: (...args: unknown[]) => update(...args),
      count: (...args: unknown[]) => count(...args),
      findFirst: (...args: unknown[]) => findFirst(...args),
    },
  },
}));

describe("email security helpers", () => {
  it("escapes HTML in template variables", () => {
    const rendered = renderEmailTemplate("welcome", { name: "<script>alert(1)</script>" });
    expect(rendered.html).toContain("&lt;script&gt;");
    expect(rendered.html).not.toContain("<script>alert(1)</script>");
    expect(escapeHtml(`a&b<"'>`)).toBe("a&amp;b&lt;&quot;&#39;&gt;");
  });

  it("masks emails and rejects open redirects", () => {
    expect(maskEmail("demo@cliplab.app")).toBe("de***@cliplab.app");
    expect(isSafeAppPath("/verify-email")).toBe(true);
    expect(isSafeAppPath("//evil.com")).toBe(false);
    expect(appPathUrl("//evil.com")).toBe(`${appOrigin()}/`);
  });

  it("does not mark SMTP as configured without required vars", () => {
    const prev = snapshotSmtpEnv();
    clearSmtpEnv();
    expect(isEmailConfigured()).toBe(false);
    expect(emailProviderStatus()).toBe("EMAIL_PROVIDER_NOT_CONFIGURED");
    expect(emailMissingVars()).toEqual(["SMTP_HOST", "SMTP_FROM", "SMTP_USER", "SMTP_PASSWORD"]);
    restoreSmtpEnv(prev);
  });

  it("does not leak SMTP secrets into NEXT_PUBLIC", () => {
    const publicKeys = Object.keys(process.env).filter((key) => key.startsWith("NEXT_PUBLIC_"));
    expect(publicKeys).not.toContain("NEXT_PUBLIC_SMTP_PASSWORD");
    expect(publicKeys).not.toContain("NEXT_PUBLIC_SMTP_USER");
  });

  it("rejects known SMTP password placeholders", () => {
    const prev = snapshotSmtpEnv();
    process.env.SMTP_HOST = "smtp.gmail.com";
    process.env.SMTP_FROM = "a@b.com";
    process.env.SMTP_USER = "a@b.com";
    process.env.SMTP_PASSWORD = "COLE_AQUI_A_SENHA_DE_APP_DE_16_CARACTERES";
    delete process.env.SMTP_PASS;
    expect(isEmailConfigured()).toBe(false);
    expect(emailMissingVars()).toContain("SMTP_PASSWORD");
    restoreSmtpEnv(prev);
  });

  it("accepts SMTP_PASS and EMAIL_FROM aliases", () => {
    const prev = snapshotSmtpEnv();
    clearSmtpEnv();
    process.env.SMTP_HOST = "smtp.gmail.com";
    process.env.SMTP_USER = "a@b.com";
    process.env.SMTP_PASS = "abcdefghijklmnop";
    process.env.EMAIL_FROM = "a@b.com";
    expect(isEmailConfigured()).toBe(true);
    expect(smtpSafeEnvCheck()).toEqual({
      SMTP_HOST: true,
      SMTP_PORT: false,
      SMTP_USER: true,
      SMTP_PASS: true,
      SMTP_FROM: true,
    });
    restoreSmtpEnv(prev);
  });

  it("reports SMTP presence only and never secret values", () => {
    const prev = snapshotSmtpEnv();
    const secret = "super-secret-app-password-xyz";
    process.env.SMTP_HOST = "smtp.gmail.com";
    process.env.SMTP_PORT = "587";
    process.env.SMTP_USER = "from@example.com";
    process.env.SMTP_PASSWORD = secret;
    process.env.SMTP_FROM = "from@example.com";
    const lines: string[] = [];
    const spy = vi.spyOn(process.stdout, "write").mockImplementation((chunk: unknown) => {
      lines.push(String(chunk).replace(/\n$/, ""));
      return true;
    });
    logSmtpEnvPresence();
    spy.mockRestore();
    expect(lines).toEqual([
      "SMTP_HOST PRESENT: true",
      "SMTP_PORT PRESENT: true",
      "SMTP_USER PRESENT: true",
      "SMTP_PASS PRESENT: true",
      "SMTP_FROM/EMAIL_FROM PRESENT: true",
    ]);
    expect(lines.join("\n")).not.toContain(secret);
    expect(JSON.stringify(smtpSafeEnvCheck())).not.toContain(secret);
    expect(LOG_REDACT_PATHS).toContain("SMTP_PASS");
    expect(LOG_REDACT_PATHS).toContain("SMTP_PASSWORD");
    expect(LOG_REDACT_PATHS).toContain("RESEND_API_KEY");
    restoreSmtpEnv(prev);
  });

  it("reports Resend presence without printing the API key", () => {
    const prev = snapshotSmtpEnv();
    const secret = "re_super_secret_live_key";
    clearSmtpEnv();
    process.env.RESEND_API_KEY = secret;
    process.env.EMAIL_FROM = "from@example.com";
    const lines: string[] = [];
    const spy = vi.spyOn(process.stdout, "write").mockImplementation((chunk: unknown) => {
      lines.push(String(chunk).replace(/\n$/, ""));
      return true;
    });
    logEmailProviderPresence();
    spy.mockRestore();
    expect(lines).toEqual(["RESEND_API_KEY PRESENT: true", "EMAIL PROVIDER: resend"]);
    expect(lines.join("\n")).not.toContain(secret);
    restoreSmtpEnv(prev);
  });

  it("maps SMTP failures to safe codes", () => {
    expect(smtpFailureCode({ code: "EAUTH" })).toBe("SMTP_AUTH_FAILED");
    expect(smtpFailureCode({ code: "ECONNECTION" })).toBe("SMTP_CONNECTION_FAILED");
    expect(smtpFailureCode(Object.assign(new Error("connection timeout"), { code: "ETIMEDOUT" }))).toBe("SMTP_TIMEOUT");
  });
});

describe("auth tokens", () => {
  afterEach(() => {
    create.mockReset();
    findFirst.mockReset();
    deleteMany.mockReset();
  });

  it("stores only the hash and is single use", async () => {
    create.mockResolvedValue({});
    deleteMany.mockResolvedValue({ count: 1 });
    const { issueAuthToken, consumeAuthToken } = await import("@/lib/email/tokens");
    const raw = await issueAuthToken("verify", "new@example.com");
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        identifier: "verify:new@example.com",
        token: hashToken(raw),
      }),
    }));
    findFirst.mockResolvedValueOnce({
      identifier: "verify:new@example.com",
      token: hashToken(raw),
      expires: new Date(Date.now() + 60_000),
    });
    const first = await consumeAuthToken("verify", raw);
    expect(first).toEqual({ ok: true, email: "new@example.com" });
    findFirst.mockResolvedValueOnce(null);
    const replay = await consumeAuthToken("verify", raw);
    expect(replay.ok).toBe(false);
  });

  it("rejects expired tokens", async () => {
    const { consumeAuthToken } = await import("@/lib/email/tokens");
    findFirst.mockResolvedValue({
      identifier: "reset:a@b.com",
      token: "hashed",
      expires: new Date(Date.now() - 1000),
    });
    deleteMany.mockResolvedValue({ count: 1 });
    const result = await consumeAuthToken("reset", "raw-token");
    expect(result).toMatchObject({ ok: false, reason: "expired", email: "a@b.com" });
  });
});

describe("email outbox", () => {
  afterEach(() => {
    create.mockReset();
    findUnique.mockReset();
    findMany.mockReset();
    update.mockReset();
    count.mockReset();
    sendMock.mockReset();
    sendMock.mockResolvedValue({ ok: false, error: "SMTP_SEND_FAILED" });
  });

  it("is idempotent on duplicate keys and keeps mail when SMTP is missing", async () => {
    const prev = snapshotSmtpEnv();
    clearSmtpEnv();
    create.mockResolvedValueOnce({ id: "mail_1", type: "welcome", recipient: "a@b.com", status: "PENDING", attempts: 0, payload: {} });
    findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValue({ id: "mail_1", type: "welcome", recipient: "a@b.com", status: "PENDING", attempts: 0, payload: {} });
    update.mockResolvedValue({});
    count.mockResolvedValue(1);
    const { enqueueEmail, processEmailOutbox } = await import("@/lib/email/outbox");
    const first = await enqueueEmail({
      type: "welcome",
      to: "a@b.com",
      userId: "user_1",
      idempotencyKey: "welcome:user_1",
    });
    expect(first.queued).toBe(true);
    expect(first.sent).toBe(false);
    const dup = await enqueueEmail({
      type: "welcome",
      to: "a@b.com",
      userId: "user_1",
      idempotencyKey: "welcome:user_1",
    });
    expect(dup.duplicate).toBe(true);
    const flush = await processEmailOutbox();
    expect(flush.reason).toBe("EMAIL: CONFIGURATION REQUIRED");
    restoreSmtpEnv(prev);
  });

  it("does not wait on SMTP when flush is false", async () => {
    sendMock.mockImplementation(() => new Promise(() => undefined));
    findUnique.mockResolvedValueOnce(null).mockResolvedValue({ id: "mail_2", status: "PENDING" });
    create.mockResolvedValueOnce({
      id: "mail_2",
      type: "verify-email",
      recipient: "a@b.com",
      status: "PENDING",
      attempts: 0,
      payload: {},
    });
    const { enqueueEmail } = await import("@/lib/email/outbox");
    const result = await enqueueEmail({
      type: "verify-email",
      to: "a@b.com",
      userId: "user_1",
      idempotencyKey: "verify:user_1:noflush",
      flush: false,
    });
    expect(result.queued).toBe(true);
    expect(result.sent).toBe(false);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("stores the production verify URL and never localhost", async () => {
    const prevApp = process.env.APP_URL;
    const prevAuth = process.env.AUTH_URL;
    process.env.APP_URL = "https://cliplab-production-6972.up.railway.app";
    process.env.AUTH_URL = "https://cliplab-production-6972.up.railway.app";
    findUnique.mockResolvedValueOnce(null).mockResolvedValue({ id: "mail_url", status: "PENDING" });
    create.mockResolvedValueOnce({
      id: "mail_url",
      type: "verify-email",
      recipient: "a@b.com",
      status: "PENDING",
      attempts: 0,
      payload: {},
    });
    const { enqueueEmail } = await import("@/lib/email/outbox");
    await enqueueEmail({
      type: "verify-email",
      to: "a@b.com",
      userId: "user_url",
      idempotencyKey: "verify:user_url:prod",
      rawToken: "verify-token",
      flush: false,
    });
    const payload = create.mock.calls[0][0].data.payload as { actionUrl?: string };
    expect(payload.actionUrl).toBe(
      "https://cliplab-production-6972.up.railway.app/verify-email?token=verify-token",
    );
    expect(payload.actionUrl).not.toContain("localhost");
    if (prevApp) process.env.APP_URL = prevApp;
    else delete process.env.APP_URL;
    if (prevAuth) process.env.AUTH_URL = prevAuth;
    else delete process.env.AUTH_URL;
  });

  it("worker processEmailOutbox sends pending mail and marks SENT", async () => {
    const prev = snapshotSmtpEnv();
    setSmtpConfigured();
    sendMock.mockResolvedValueOnce({ ok: true });
    findMany.mockResolvedValueOnce([{ id: "mail_ok" }]);
    findUnique.mockResolvedValue({
      id: "mail_ok",
      type: "verify-email",
      recipient: "a@b.com",
      status: "PENDING",
      attempts: 0,
      payload: { actionUrl: "https://cliplab-production-6972.up.railway.app/verify-email?token=abc" },
    });
    update.mockResolvedValue({});
    const { processEmailOutbox } = await import("@/lib/email/outbox");
    const result = await processEmailOutbox();
    expect(result.processed).toBe(1);
    expect(sendMock).toHaveBeenCalledTimes(1);
    const statuses = update.mock.calls.map((call) => (call[0] as { data?: { status?: string } }).data?.status);
    expect(statuses).toContain("SENDING");
    expect(statuses).toContain("SENT");
    restoreSmtpEnv(prev);
  });

  it("keeps SMTP failures pending then FAILED after 8 attempts", async () => {
    const prev = snapshotSmtpEnv();
    setSmtpConfigured();
    sendMock.mockResolvedValue({ ok: false, error: "SMTP_TIMEOUT" });
    findUnique.mockResolvedValue({
      id: "mail_retry",
      type: "verify-email",
      recipient: "a@b.com",
      status: "PENDING",
      attempts: 7,
      payload: {},
    });
    update.mockResolvedValue({});
    const { flushEmail } = await import("@/lib/email/outbox");
    const result = await flushEmail("mail_retry");
    expect(result.sent).toBe(false);
    const statuses = update.mock.calls.map((call) => (call[0] as { data?: { status?: string } }).data?.status);
    expect(statuses).toContain("FAILED");
    expect(statuses).not.toContain("SENT");
    restoreSmtpEnv(prev);
  });

  it("queues verification email without calling SMTP", async () => {
    const prev = snapshotSmtpEnv();
    setSmtpConfigured();
    findUnique.mockResolvedValueOnce(null).mockResolvedValue({ id: "v1", status: "PENDING" });
    create.mockResolvedValue({
      id: "v1",
      type: "verify-email",
      recipient: "a@b.com",
      status: "PENDING",
      attempts: 0,
      payload: {},
    });
    const { sendVerificationEmail } = await import("@/lib/email/send");
    const result = await sendVerificationEmail({ to: "a@b.com", userId: "u1", rawToken: "raw-verify-token" });
    expect(result.queued).toBe(true);
    expect(result.ok).toBe(true);
    expect(sendMock).not.toHaveBeenCalled();
    restoreSmtpEnv(prev);
  });

  it("does not confirm resend when enqueue fails or SMTP is missing", async () => {
    create.mockRejectedValue(new Error("db down"));
    findUnique.mockResolvedValue(null);
    const { sendVerificationEmail } = await import("@/lib/email/send");
    const sent = await sendVerificationEmail({ to: "a@b.com", userId: "u1", rawToken: "raw-verify-token" });
    expect(sent).toMatchObject({ ok: false, reason: "ENQUEUE_FAILED", queued: false, outboxId: null });
    expect(canConfirmVerificationResend(sent, true)).toBe(false);
    expect(canConfirmVerificationResend({ queued: true }, false)).toBe(false);
    expect(canConfirmVerificationResend({ queued: true }, true)).toBe(true);
    expect(canConfirmVerificationResend({ queued: false, duplicate: true }, true)).toBe(true);
  });

  it("does not log SMTP secrets or verification tokens", async () => {
    const prev = snapshotSmtpEnv();
    const secret = "super-secret-app-password-xyz";
    setSmtpConfigured();
    process.env.SMTP_PASSWORD = secret;
    const info = vi.spyOn(logger, "info").mockImplementation(() => logger);
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => logger);
    findUnique.mockResolvedValueOnce(null).mockResolvedValue({ id: "vlog", status: "PENDING" });
    create.mockResolvedValue({
      id: "vlog",
      type: "verify-email",
      recipient: "a@b.com",
      status: "PENDING",
      attempts: 0,
      payload: {},
    });
    const { sendVerificationEmail } = await import("@/lib/email/send");
    await sendVerificationEmail({ to: "a@b.com", userId: "u1", rawToken: "raw-verify-token-secret" });
    const dumped = JSON.stringify([...info.mock.calls, ...warn.mock.calls]);
    expect(dumped).not.toContain(secret);
    expect(dumped).not.toContain("raw-verify-token-secret");
    info.mockRestore();
    warn.mockRestore();
    restoreSmtpEnv(prev);
  });
});

describe("workspace isolation in billing mail keys", () => {
  afterEach(() => {
    create.mockReset();
    findUnique.mockReset();
    update.mockReset();
  });

  it("uses subscription and invoice ids instead of client input", async () => {
    const { sendPaymentFailedEmail, sendSubscriptionActivatedEmail } = await import("@/lib/email/send");
    create.mockResolvedValue({ id: "m1", type: "payment-failed", recipient: "a@b.com", status: "PENDING", attempts: 0, payload: {} });
    findUnique.mockResolvedValueOnce(null).mockResolvedValue({ id: "m1", type: "payment-failed", recipient: "a@b.com", status: "PENDING", attempts: 0, payload: {} });
    update.mockResolvedValue({});
    await sendPaymentFailedEmail({
      to: "owner-a@example.com",
      workspaceId: "ws_a",
      invoiceId: "in_1",
    });
    expect(create.mock.calls[0][0].data.idempotencyKey).toBe("pay-fail:in_1");
    expect(create.mock.calls[0][0].data.workspaceId).toBe("ws_a");
    create.mockResolvedValue({ id: "m2", type: "subscription-activated", recipient: "a@b.com", status: "PENDING", attempts: 0, payload: {} });
    findUnique.mockResolvedValueOnce(null).mockResolvedValue({ id: "m2", type: "subscription-activated", recipient: "a@b.com", status: "PENDING", attempts: 0, payload: {} });
    await sendSubscriptionActivatedEmail({
      to: "owner-a@example.com",
      workspaceId: "ws_a",
      planName: "CLIPLAB Pro",
      subscriptionId: "sub_1",
    });
    expect(create.mock.calls.at(-1)?.[0].data.idempotencyKey).toBe("sub-activated:sub_1");
  });

  it("does not mark SENT unless the provider accepted delivery", async () => {
    const prev = snapshotSmtpEnv();
    setSmtpConfigured();
    sendMock.mockResolvedValueOnce({ ok: false, error: "SMTP_NOT_ACCEPTED" });
    create.mockResolvedValue({ id: "mail_fail", type: "welcome", recipient: "a@b.com", status: "PENDING", attempts: 0, payload: {} });
    findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "mail_fail", type: "welcome", recipient: "a@b.com", status: "PENDING", attempts: 0, payload: {} })
      .mockResolvedValueOnce({ status: "PENDING" });
    update.mockResolvedValue({});
    const { enqueueEmail } = await import("@/lib/email/outbox");
    const result = await enqueueEmail({
      type: "welcome",
      to: "a@b.com",
      userId: "user_fail",
      idempotencyKey: "welcome:user_fail",
    });
    expect(result.sent).toBe(false);
    const statuses = update.mock.calls.map((call) => (call[0] as { data?: { status?: string } }).data?.status);
    expect(statuses).toContain("SENDING");
    expect(statuses).not.toContain("SENT");
    restoreSmtpEnv(prev);
  });
});
