import { emailProviderName } from "@/lib/email/config";
import { logger } from "@/lib/logger";
import type { EmailMessage, EmailProvider } from "@/lib/email/provider";
import { ResendEmailProvider } from "@/lib/email/resend-provider";
import { SmtpEmailProvider } from "@/lib/email/smtp-provider";

class DisabledEmailProvider implements EmailProvider {
  name = "disabled";

  async send(): Promise<{ ok: true } | { ok: false; error: string }> {
    logger.warn("EMAIL SMTP ERROR: CONFIGURATION_REQUIRED");
    return { ok: false, error: "EMAIL: CONFIGURATION REQUIRED" };
  }
}

export function getEmailProvider(): EmailProvider {
  const name = emailProviderName();
  if (name === "resend") return new ResendEmailProvider();
  if (name === "smtp") return new SmtpEmailProvider();
  return new DisabledEmailProvider();
}

export async function sendEmail(message: EmailMessage) {
  return getEmailProvider().send(message);
}
