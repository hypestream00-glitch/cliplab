export type EmailMessage = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

export interface EmailProvider {
  name: string;
  send(message: EmailMessage): Promise<{ ok: true } | { ok: false; error: string }>;
}
