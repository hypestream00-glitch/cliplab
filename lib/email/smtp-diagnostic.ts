import { lookup as dnsLookup } from "node:dns/promises";
import { connect as tcpConnectRaw } from "node:net";
import { connect as tlsConnectRaw } from "node:tls";
import { withTimeout } from "@/lib/async/timeout";
import { emailProviderName, isEmailConfigured, smtpPort } from "@/lib/email/config";
import { smtpFailureCode } from "@/lib/email/smtp-provider";

const STEP_MS = 8_000;

export type SmtpDiagStatus = "OK" | "FAIL";

export type SmtpDiagnosticResult = {
  dns: SmtpDiagStatus;
  tcp: SmtpDiagStatus;
  tls: SmtpDiagStatus;
  verify: SmtpDiagStatus;
  error: string | null;
};

export type SmtpDiagnosticDeps = {
  lookup: (host: string) => Promise<unknown>;
  tcpConnect: (host: string, port: number) => Promise<void>;
  tlsHandshake: (host: string, port: number) => Promise<void>;
  verifySmtp: () => Promise<{ ok: boolean; error?: string }>;
};

function bootLog(line: string) {
  process.stdout.write(`${line}\n`);
}

export function smtpDiagnosticHost() {
  return process.env.SMTP_HOST?.trim() ?? "";
}

const SAFE_ERROR_TYPES = new Set([
  "Timeout",
  "DNS_FAILED",
  "TCP_REFUSED",
  "TLS_FAILED",
  "SMTP_AUTH_FAILED",
  "SMTP_CONNECTION_FAILED",
  "SMTP_VERIFY_FAILED",
  "CONFIGURATION_REQUIRED",
  "SMTP_TIMEOUT",
  "SMTP_SEND_FAILED",
]);

export function smtpDiagnosticSafeError(error: unknown): string {
  if (typeof error === "string") {
    return SAFE_ERROR_TYPES.has(error) ? error : "SMTP_CONNECTION_FAILED";
  }
  if (error instanceof Error && /timeout/i.test(error.message)) return "Timeout";
  const code =
    error && typeof error === "object" && "code" in error ? String((error as { code?: string }).code ?? "") : "";
  if (code === "ENOTFOUND" || code === "EAI_AGAIN") return "DNS_FAILED";
  if (code === "ECONNREFUSED") return "TCP_REFUSED";
  if (code === "CERT_HAS_EXPIRED" || code === "UNABLE_TO_VERIFY_LEAF_SIGNATURE" || code === "ERR_TLS_CERT_ALTNAME_INVALID") {
    return "TLS_FAILED";
  }
  if (code === "EAUTH") return "SMTP_AUTH_FAILED";
  if (code === "ETIMEDOUT" || code === "ECONNECTION" || code === "ESOCKET") return "SMTP_CONNECTION_FAILED";
  const mapped = smtpFailureCode(error);
  if (mapped === "SMTP_TIMEOUT") return "Timeout";
  return SAFE_ERROR_TYPES.has(mapped) ? mapped : "SMTP_CONNECTION_FAILED";
}

function tcpConnect(host: string, port: number) {
  return new Promise<void>((resolve, reject) => {
    const socket = tcpConnectRaw({ host, port });
    const fail = (error: unknown) => {
      socket.destroy();
      reject(error);
    };
    socket.setTimeout(STEP_MS, () => fail(Object.assign(new Error("tcp timeout"), { code: "ETIMEDOUT" })));
    socket.once("connect", () => {
      socket.end();
      socket.destroy();
      resolve();
    });
    socket.once("error", fail);
  });
}

function tlsHandshake(host: string, port: number) {
  return new Promise<void>((resolve, reject) => {
    const socket = tlsConnectRaw({
      host,
      port,
      servername: host,
      minVersion: "TLSv1.2",
      timeout: STEP_MS,
    });
    const fail = (error: unknown) => {
      socket.destroy();
      reject(error);
    };
    socket.once("secureConnect", () => {
      socket.end();
      socket.destroy();
      resolve();
    });
    socket.once("timeout", () => fail(Object.assign(new Error("tls timeout"), { code: "ETIMEDOUT" })));
    socket.once("error", fail);
  });
}

async function defaultVerifySmtp() {
  const { SmtpEmailProvider } = await import("@/lib/email/smtp-provider");
  return new SmtpEmailProvider().verifyConnection();
}

export function logSmtpDiagnostic(result: SmtpDiagnosticResult) {
  bootLog(`SMTP DIAGNOSTIC DNS: ${result.dns}`);
  bootLog(`SMTP DIAGNOSTIC TCP: ${result.tcp}`);
  bootLog(`SMTP DIAGNOSTIC TLS: ${result.tls}`);
  bootLog(`SMTP DIAGNOSTIC VERIFY: ${result.verify}`);
  if (result.error) bootLog(`SMTP DIAGNOSTIC ERROR: ${result.error}`);
}

function defaultDeps(): SmtpDiagnosticDeps {
  return {
    lookup: (host) => dnsLookup(host),
    tcpConnect,
    tlsHandshake,
    verifySmtp: defaultVerifySmtp,
  };
}

export async function runSmtpConnectivityDiagnostic(deps: SmtpDiagnosticDeps = defaultDeps()): Promise<SmtpDiagnosticResult> {
  const result: SmtpDiagnosticResult = {
    dns: "FAIL",
    tcp: "FAIL",
    tls: "FAIL",
    verify: "FAIL",
    error: null,
  };
  if (emailProviderName() === "resend") {
    result.error = "SKIPPED_RESEND";
    bootLog("SMTP DIAGNOSTIC SKIPPED: resend");
    return result;
  }
  const host = smtpDiagnosticHost();
  const port = smtpPort();
  if (!host) {
    result.error = "CONFIGURATION_REQUIRED";
    logSmtpDiagnostic(result);
    return result;
  }

  try {
    await withTimeout(deps.lookup(host), STEP_MS, "smtp dns");
    result.dns = "OK";
  } catch (error) {
    result.error = smtpDiagnosticSafeError(error);
    logSmtpDiagnostic(result);
    return result;
  }

  try {
    await withTimeout(deps.tcpConnect(host, port), STEP_MS, "smtp tcp");
    result.tcp = "OK";
  } catch (error) {
    result.error = smtpDiagnosticSafeError(error);
    logSmtpDiagnostic(result);
    return result;
  }

  try {
    await withTimeout(deps.tlsHandshake(host, port), STEP_MS, "smtp tls");
    result.tls = "OK";
  } catch (error) {
    result.error = smtpDiagnosticSafeError(error);
    logSmtpDiagnostic(result);
    return result;
  }

  if (!isEmailConfigured()) {
    result.error = "CONFIGURATION_REQUIRED";
    logSmtpDiagnostic(result);
    return result;
  }

  try {
    const verify = await withTimeout(deps.verifySmtp(), STEP_MS, "smtp verify");
    if (verify.ok) {
      result.verify = "OK";
    } else {
      result.error = smtpDiagnosticSafeError(verify.error ?? "SMTP_VERIFY_FAILED");
    }
  } catch (error) {
    result.error = smtpDiagnosticSafeError(error);
  }

  logSmtpDiagnostic(result);
  return result;
}
