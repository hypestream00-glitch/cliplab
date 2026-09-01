import { afterEach, describe, expect, it, vi } from "vitest";
import {
  emailProviderName,
  isEmailConfigured,
  isResendConfigured,
  isSmtpConfigured,
  logEmailProviderPresence,
} from "@/lib/email/config";
import { getEmailProvider, sendEmail } from "@/lib/email/send-email";
import { ResendEmailProvider, type ResendSendFn } from "@/lib/email/resend-provider";
import { SmtpEmailProvider } from "@/lib/email/smtp-provider";
import { LOG_REDACT_PATHS } from "@/lib/logger";

const KEYS = [
  "RESEND_API_KEY",
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_SECURE",
  "SMTP_USER",
  "SMTP_PASSWORD",
  "SMTP_PASS",
  "SMTP_FROM",
  "EMAIL_FROM",
  "SMTP_FROM_NAME",
] as const;

const prev = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));

function restore() {
  for (const key of KEYS) {
    if (prev[key]) process.env[key] = prev[key];
    else delete process.env[key];
  }
}

function clearAll() {
  for (const key of KEYS) delete process.env[key];
}

function setSmtp() {
  process.env.SMTP_HOST = "smtp.gmail.com";
  process.env.SMTP_PORT = "465";
  process.env.SMTP_SECURE = "true";
  process.env.SMTP_USER = "secret-user@gmail.com";
  process.env.SMTP_PASSWORD = "super-secret-app-password";
  process.env.SMTP_FROM = "from@example.com";
}

const message = {
  to: "user@example.com",
  subject: "Verify",
  html: "<p>Hi</p>",
  text: "Hi",
};

describe("resend email provider selection", () => {
  afterEach(() => {
    restore();
  });

  it("selects Resend when RESEND_API_KEY exists even if SMTP is configured", () => {
    clearAll();
    setSmtp();
    process.env.RESEND_API_KEY = "re_test_key_not_for_network";
    expect(emailProviderName()).toBe("resend");
    expect(isResendConfigured()).toBe(true);
    expect(isSmtpConfigured()).toBe(true);
    expect(isEmailConfigured()).toBe(true);
    expect(getEmailProvider().name).toBe("resend");
  });

  it("falls back to SMTP when Resend is absent and SMTP is complete", () => {
    clearAll();
    setSmtp();
    expect(emailProviderName()).toBe("smtp");
    expect(getEmailProvider().name).toBe("smtp");
  });

  it("disables sending when neither Resend nor SMTP is configured", () => {
    clearAll();
    expect(emailProviderName()).toBe("disabled");
    expect(isEmailConfigured()).toBe(false);
    expect(getEmailProvider().name).toBe("disabled");
  });

  it("does not call SMTP when Resend is active", async () => {
    clearAll();
    setSmtp();
    process.env.RESEND_API_KEY = "re_test_key_not_for_network";
    const resendSend = vi.fn<ResendSendFn>(async () => ({ id: "email_1" }));
    const smtpSend = vi.spyOn(SmtpEmailProvider.prototype, "send");
    const provider = new ResendEmailProvider(resendSend);
    const result = await provider.send(message);
    expect(result).toEqual({ ok: true });
    expect(resendSend).toHaveBeenCalledOnce();
    expect(smtpSend).not.toHaveBeenCalled();
    smtpSend.mockRestore();

    const selected = getEmailProvider();
    expect(selected.name).toBe("resend");
    expect(selected).toBeInstanceOf(ResendEmailProvider);
  });

  it("refuses SMTP send when Resend is the selected provider", async () => {
    clearAll();
    setSmtp();
    process.env.RESEND_API_KEY = "re_test_key_not_for_network";
    const smtp = new SmtpEmailProvider();
    const result = await smtp.send(message);
    expect(result).toEqual({ ok: false, error: "SMTP_SKIPPED_RESEND" });
  });

  it("does not leak the Resend API key in boot logs or logger redaction", () => {
    clearAll();
    const secret = "re_live_super_secret_key_xyz";
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
    expect(LOG_REDACT_PATHS).toContain("RESEND_API_KEY");
  });

  it("sendEmail uses the injected Resend client and never hits SMTP", async () => {
    clearAll();
    setSmtp();
    process.env.RESEND_API_KEY = "re_test_key_not_for_network";
    const resendSend = vi.fn<ResendSendFn>(async (payload) => {
      expect(payload.from).toContain("from@example.com");
      expect(payload.to).toBe("user@example.com");
      return { id: "email_2" };
    });
    const smtpSend = vi.spyOn(SmtpEmailProvider.prototype, "send");
    const result = await new ResendEmailProvider(resendSend).send(message);
    expect(result.ok).toBe(true);
    expect(resendSend).toHaveBeenCalledOnce();
    expect(smtpSend).not.toHaveBeenCalled();
    smtpSend.mockRestore();
  });

  it("default Resend client does not send during tests", async () => {
    clearAll();
    process.env.RESEND_API_KEY = "re_would_send_if_unguarded";
    process.env.EMAIL_FROM = "from@example.com";
    const result = await sendEmail(message);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("TEST_OR_BUILD");
  });
});
