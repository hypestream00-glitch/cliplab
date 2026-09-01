import nodemailer from "nodemailer";
import { withTimeout } from "@/lib/async/timeout";
import { logger } from "@/lib/logger";
import { isEmailConfigured, smtpAuthPassword, smtpFromAddress, smtpFromName, smtpPort, smtpSecure } from "@/lib/email/config";
import type { EmailMessage, EmailProvider } from "@/lib/email/provider";

function smtpAuthUser() {
  return process.env.SMTP_USER?.trim() ?? "";
}

function createTransport() {
  const secure = smtpSecure();
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST?.trim(),
    port: smtpPort(),
    secure,
    requireTLS: !secure,
    connectionTimeout: 8_000,
    greetingTimeout: 8_000,
    socketTimeout: 12_000,
    auth: {
      user: smtpAuthUser(),
      pass: smtpAuthPassword(),
    },
  });
}

function addresses(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (typeof item === "string") return item;
      if (item && typeof item === "object" && "address" in item) {
        return String((item as { address?: string }).address ?? "");
      }
      return "";
    })
    .filter(Boolean);
}

function smtpFailureCode(error: unknown): string {
  const code =
    error && typeof error === "object" && "code" in error ? String((error as { code?: string }).code ?? "") : "";
  if (code === "EAUTH") return "SMTP_AUTH_FAILED";
  return "SMTP_SEND_FAILED";
}

export class SmtpEmailProvider implements EmailProvider {
  name = "smtp";

  async send(message: EmailMessage): Promise<{ ok: true } | { ok: false; error: string }> {
    if (!isEmailConfigured()) {
      return { ok: false, error: "EMAIL: CONFIGURATION REQUIRED" };
    }
    try {
      const transporter = createTransport();
      const info = await withTimeout(
        transporter.sendMail({
          from: `"${smtpFromName().replace(/"/g, "")}" <${smtpFromAddress()}>`,
          to: message.to,
          subject: message.subject,
          text: message.text,
          html: message.html,
        }),
        12_000,
        "smtp send",
      );
      const accepted = addresses(info.accepted);
      const rejected = addresses(info.rejected);
      if (!accepted.length || rejected.length) {
        logger.warn({ accepted: accepted.length, rejected: rejected.length }, "smtp message not accepted");
        return { ok: false, error: "SMTP_NOT_ACCEPTED" };
      }
      return { ok: true };
    } catch (error) {
      const code = smtpFailureCode(error);
      logger.warn({ code }, "smtp send failed");
      return { ok: false, error: code };
    }
  }

  async verifyConnection() {
    if (!isEmailConfigured()) return { ok: false as const, error: "EMAIL: CONFIGURATION REQUIRED" };
    try {
      const transporter = createTransport();
      await withTimeout(transporter.verify(), 8_000, "smtp verify");
      return { ok: true as const };
    } catch (error) {
      const code = smtpFailureCode(error);
      logger.warn({ code }, "smtp verify failed");
      return { ok: false as const, error: code === "SMTP_AUTH_FAILED" ? "SMTP_AUTH_FAILED" : "SMTP_VERIFY_FAILED" };
    }
  }
}

export function getEmailProvider(): EmailProvider {
  return new SmtpEmailProvider();
}
