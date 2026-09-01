import { Resend } from "resend";
import { withTimeout } from "@/lib/async/timeout";
import { isNextBuildPhase } from "@/lib/env/build-phase";
import { logger } from "@/lib/logger";
import { isResendConfigured, resendApiKey, smtpFromAddress, smtpFromName } from "@/lib/email/config";
import type { EmailMessage, EmailProvider } from "@/lib/email/provider";

export type ResendSendPayload = {
  from: string;
  to: string;
  subject: string;
  html: string;
  text: string;
};

export type ResendSendFn = (payload: ResendSendPayload) => Promise<{ id?: string | null }>;

function isTestOrBuild() {
  if (process.env.VITEST) return true;
  if (process.env.NODE_ENV === "test") return true;
  return isNextBuildPhase();
}

export function resendFromHeader() {
  const name = smtpFromName().replace(/"/g, "");
  return `${name} <${smtpFromAddress()}>`;
}

export function resendFailureCode(error: unknown): string {
  if (error instanceof Error && /timeout/i.test(error.message)) return "Timeout";
  const code =
    error && typeof error === "object" && "code" in error ? String((error as { code?: string }).code ?? "") : "";
  if (code === "TEST_OR_BUILD") return "TEST_OR_BUILD";
  const status =
    error && typeof error === "object" && "statusCode" in error
      ? Number((error as { statusCode?: number }).statusCode)
      : NaN;
  if (status === 401 || status === 403 || code === "restricted_api_key") return "RESEND_AUTH_FAILED";
  return "RESEND_SEND_FAILED";
}

export function createDefaultResendSend(): ResendSendFn {
  return async (payload) => {
    if (isTestOrBuild()) {
      throw Object.assign(new Error("resend skipped"), { code: "TEST_OR_BUILD" });
    }
    const resend = new Resend(resendApiKey());
    const { data, error } = await resend.emails.send({
      from: payload.from,
      to: payload.to,
      subject: payload.subject,
      html: payload.html,
      text: payload.text,
    });
    if (error) {
      const statusCode =
        error && typeof error === "object" && "statusCode" in error
          ? Number((error as { statusCode?: unknown }).statusCode)
          : undefined;
      throw Object.assign(new Error("resend failed"), {
        code: typeof error.name === "string" ? error.name : "RESEND_SEND_FAILED",
        statusCode,
      });
    }
    return { id: data?.id };
  };
}

export class ResendEmailProvider implements EmailProvider {
  name = "resend";

  constructor(private readonly sendViaResend: ResendSendFn = createDefaultResendSend()) {}

  async send(message: EmailMessage): Promise<{ ok: true } | { ok: false; error: string }> {
    if (!isResendConfigured()) {
      logger.warn("EMAIL SEND ERROR: CONFIGURATION_REQUIRED");
      return { ok: false, error: "EMAIL: CONFIGURATION REQUIRED" };
    }
    logger.info("EMAIL SEND START");
    try {
      await withTimeout(
        this.sendViaResend({
          from: resendFromHeader(),
          to: message.to,
          subject: message.subject,
          html: message.html,
          text: message.text,
        }),
        12_000,
        "resend send",
      );
      logger.info("EMAIL SEND SUCCESS");
      return { ok: true };
    } catch (error) {
      const code = resendFailureCode(error);
      logger.warn(`EMAIL SEND ERROR: ${code}`);
      return { ok: false, error: code };
    }
  }
}
