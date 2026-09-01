import { getEmailProvider, sendEmail } from "@/lib/email/send-email";
import { SmtpEmailProvider } from "@/lib/email/smtp-provider";
import { ResendEmailProvider } from "@/lib/email/resend-provider";
import type { EmailMessage, EmailProvider } from "@/lib/email/provider";
import {
  sendPasswordResetEmail,
  sendPaymentFailedEmail,
  sendSubscriptionActivatedEmail,
  sendSubscriptionCanceledEmail,
  sendSubscriptionChangedEmail,
  sendTemplatedEmail,
  sendVerificationEmail,
  sendWelcomeEmail,
} from "@/lib/email/send";

export class ClipLabMailer {
  constructor(private readonly provider: EmailProvider = getEmailProvider()) {}

  send(message: EmailMessage) {
    return this.provider.send(message);
  }

  sendVerificationEmail = sendVerificationEmail;
  sendPasswordResetEmail = sendPasswordResetEmail;
  sendWelcomeEmail = sendWelcomeEmail;
  sendSubscriptionActivatedEmail = sendSubscriptionActivatedEmail;
  sendSubscriptionChangedEmail = sendSubscriptionChangedEmail;
  sendSubscriptionCanceledEmail = sendSubscriptionCanceledEmail;
  sendPaymentFailedEmail = sendPaymentFailedEmail;
  sendTemplatedEmail = sendTemplatedEmail;
}

export { SmtpEmailProvider, ResendEmailProvider, getEmailProvider, sendEmail };
export type { EmailProvider, EmailMessage };
