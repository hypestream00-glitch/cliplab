export const EMAIL_REQUIRED_VARS = ["SMTP_HOST", "SMTP_FROM", "SMTP_USER", "SMTP_PASSWORD"] as const;

const SMTP_PASSWORD_PLACEHOLDERS = new Set([
  "COLE_AQUI_A_SENHA_DE_APP_DE_16_CARACTERES",
  "changeme",
  "password",
  "your_password_here",
]);

export type EmailProviderName = "smtp";

export function emailProviderName(): EmailProviderName {
  const value = (process.env.EMAIL_PROVIDER ?? "smtp").trim().toLowerCase();
  return value === "smtp" ? "smtp" : "smtp";
}

export function smtpPort() {
  const parsed = Number(process.env.SMTP_PORT ?? "587");
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 587;
}

export function smtpSecure() {
  const raw = process.env.SMTP_SECURE?.trim().toLowerCase();
  if (raw === "1" || raw === "true" || raw === "yes" || raw === "on") return true;
  if (raw === "0" || raw === "false" || raw === "no" || raw === "off") return false;
  return smtpPort() === 465;
}

export function smtpFromName() {
  return (process.env.SMTP_FROM_NAME ?? "CLIPLAB").trim() || "CLIPLAB";
}

export function smtpFromAddress() {
  return process.env.SMTP_FROM?.trim() ?? "";
}

export function smtpAuthPassword() {
  return (process.env.SMTP_PASSWORD ?? "").trim().replace(/\s+/g, "");
}

export function emailMissingVars() {
  const missing = EMAIL_REQUIRED_VARS.filter((key) => {
    if (key === "SMTP_PASSWORD") return smtpAuthPassword().length === 0;
    return !process.env[key]?.trim();
  });
  if (SMTP_PASSWORD_PLACEHOLDERS.has(smtpAuthPassword()) && !missing.includes("SMTP_PASSWORD")) {
    missing.push("SMTP_PASSWORD");
  }
  return missing;
}

export function isEmailConfigured() {
  return emailProviderName() === "smtp" && emailMissingVars().length === 0;
}

export function emailProviderStatus() {
  return isEmailConfigured() ? "CONFIGURED" : "EMAIL_PROVIDER_NOT_CONFIGURED";
}

export function emailConfigurationDetail() {
  if (isEmailConfigured()) return "EMAIL PROVIDER: smtp · SMTP: CONNECTED";
  const missing = emailMissingVars();
  return `EMAIL: CONFIGURATION REQUIRED (${missing.join(", ") || "incomplete"})`;
}
