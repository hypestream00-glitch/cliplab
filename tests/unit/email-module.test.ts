import { afterEach, describe, expect, it, vi } from "vitest";
import { escapeHtml, maskEmail } from "@/lib/email/escape";
import { appOrigin, appPathUrl, isSafeAppPath } from "@/lib/email/app-url";
import { emailMissingVars, emailProviderStatus, isEmailConfigured } from "@/lib/email/config";
import { renderEmailTemplate } from "@/lib/email/templates";
import { hashToken } from "@/lib/security/crypto";

const create = vi.fn();
const findFirst = vi.fn();
const deleteMany = vi.fn();
const update = vi.fn();
const findUnique = vi.fn();
const findMany = vi.fn();
const count = vi.fn();

const sendMock = vi.fn(async () => ({ ok: false as const, error: "SMTP_SEND_FAILED" }));

vi.mock("@/lib/email/smtp-provider", () => ({
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
    const keys = ["SMTP_HOST", "SMTP_FROM", "SMTP_USER", "SMTP_PASSWORD"];
    const prev = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
    for (const key of keys) delete process.env[key];
    expect(isEmailConfigured()).toBe(false);
    expect(emailProviderStatus()).toBe("EMAIL_PROVIDER_NOT_CONFIGURED");
    expect(emailMissingVars()).toEqual(keys);
    for (const key of keys) {
      if (prev[key]) process.env[key] = prev[key];
      else delete process.env[key];
    }
  });

  it("does not leak SMTP secrets into NEXT_PUBLIC", () => {
    const publicKeys = Object.keys(process.env).filter((key) => key.startsWith("NEXT_PUBLIC_"));
    expect(publicKeys).not.toContain("NEXT_PUBLIC_SMTP_PASSWORD");
    expect(publicKeys).not.toContain("NEXT_PUBLIC_SMTP_USER");
  });

  it("rejects known SMTP password placeholders", () => {
    const keys = ["SMTP_HOST", "SMTP_FROM", "SMTP_USER", "SMTP_PASSWORD"] as const;
    const prev = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
    process.env.SMTP_HOST = "smtp.gmail.com";
    process.env.SMTP_FROM = "a@b.com";
    process.env.SMTP_USER = "a@b.com";
    process.env.SMTP_PASSWORD = "COLE_AQUI_A_SENHA_DE_APP_DE_16_CARACTERES";
    expect(isEmailConfigured()).toBe(false);
    expect(emailMissingVars()).toContain("SMTP_PASSWORD");
    for (const key of keys) {
      if (prev[key]) process.env[key] = prev[key];
      else delete process.env[key];
    }
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
    sendMock.mockReset();
    sendMock.mockResolvedValue({ ok: false, error: "SMTP_SEND_FAILED" });
  });

  it("is idempotent on duplicate keys and keeps mail when SMTP is missing", async () => {
    const prev = {
      SMTP_HOST: process.env.SMTP_HOST,
      SMTP_FROM: process.env.SMTP_FROM,
      SMTP_USER: process.env.SMTP_USER,
      SMTP_PASSWORD: process.env.SMTP_PASSWORD,
    };
    delete process.env.SMTP_HOST;
    delete process.env.SMTP_FROM;
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASSWORD;
    create.mockResolvedValueOnce({ id: "mail_1", type: "welcome", recipient: "a@b.com", status: "PENDING", attempts: 0, payload: {} });
    findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValue({ id: "mail_1", type: "welcome", recipient: "a@b.com", status: "PENDING", attempts: 0, payload: {} });
    update.mockResolvedValue({});
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
    for (const [key, value] of Object.entries(prev)) {
      if (value) process.env[key] = value;
      else delete process.env[key];
    }
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
    const keys = ["SMTP_HOST", "SMTP_FROM", "SMTP_USER", "SMTP_PASSWORD"] as const;
    const prev = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
    process.env.SMTP_HOST = "smtp.gmail.com";
    process.env.SMTP_FROM = "from@example.com";
    process.env.SMTP_USER = "from@example.com";
    process.env.SMTP_PASSWORD = "app-password-not-logged";
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
    for (const key of keys) {
      if (prev[key]) process.env[key] = prev[key];
      else delete process.env[key];
    }
  });
});
