import { afterEach, describe, expect, it, vi } from "vitest";
import {
  logSmtpDiagnostic,
  runSmtpConnectivityDiagnostic,
  smtpDiagnosticSafeError,
  type SmtpDiagnosticDeps,
} from "@/lib/email/smtp-diagnostic";

const SMTP_KEYS = ["SMTP_HOST", "SMTP_PORT", "SMTP_SECURE", "SMTP_USER", "SMTP_PASSWORD", "SMTP_PASS", "SMTP_FROM", "RESEND_API_KEY"] as const;

const prevSmtp = Object.fromEntries(SMTP_KEYS.map((key) => [key, process.env[key]]));

function restoreSmtp() {
  for (const key of SMTP_KEYS) {
    if (prevSmtp[key]) process.env[key] = prevSmtp[key];
    else delete process.env[key];
  }
}

function clearSmtp() {
  for (const key of SMTP_KEYS) delete process.env[key];
}

function setSmtp() {
  delete process.env.RESEND_API_KEY;
  process.env.SMTP_HOST = "smtp.gmail.com";
  process.env.SMTP_PORT = "465";
  process.env.SMTP_SECURE = "true";
  process.env.SMTP_USER = "secret-user@gmail.com";
  process.env.SMTP_PASSWORD = "super-secret-app-password";
  process.env.SMTP_FROM = "secret-user@gmail.com";
}

function okDeps(overrides: Partial<SmtpDiagnosticDeps> = {}): SmtpDiagnosticDeps {
  return {
    lookup: vi.fn(async () => ({ address: "8.8.8.8", family: 4 })),
    tcpConnect: vi.fn(async () => undefined),
    tlsHandshake: vi.fn(async () => undefined),
    verifySmtp: vi.fn(async () => ({ ok: true as const })),
    ...overrides,
  };
}

describe("smtp connectivity diagnostic", () => {
  afterEach(() => {
    restoreSmtp();
  });

  it("fails closed when SMTP_HOST is missing", async () => {
    clearSmtp();
    const lines: string[] = [];
    const spy = vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      lines.push(String(chunk).replace(/\n$/, ""));
      return true;
    });
    const result = await runSmtpConnectivityDiagnostic(okDeps());
    spy.mockRestore();
    expect(result).toEqual({
      dns: "FAIL",
      tcp: "FAIL",
      tls: "FAIL",
      verify: "FAIL",
      error: "CONFIGURATION_REQUIRED",
    });
    expect(lines).toEqual([
      "SMTP DIAGNOSTIC DNS: FAIL",
      "SMTP DIAGNOSTIC TCP: FAIL",
      "SMTP DIAGNOSTIC TLS: FAIL",
      "SMTP DIAGNOSTIC VERIFY: FAIL",
      "SMTP DIAGNOSTIC ERROR: CONFIGURATION_REQUIRED",
    ]);
  });

  it("reports DNS/TCP/TLS/VERIFY without sending mail or leaking secrets", async () => {
    setSmtp();
    const deps = okDeps();
    const lines: string[] = [];
    const spy = vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      lines.push(String(chunk).replace(/\n$/, ""));
      return true;
    });
    const result = await runSmtpConnectivityDiagnostic(deps);
    spy.mockRestore();
    expect(result).toEqual({ dns: "OK", tcp: "OK", tls: "OK", verify: "OK", error: null });
    expect(deps.lookup).toHaveBeenCalledWith("smtp.gmail.com");
    expect(deps.tcpConnect).toHaveBeenCalledWith("smtp.gmail.com", 465);
    expect(deps.tlsHandshake).toHaveBeenCalledWith("smtp.gmail.com", 465);
    expect(deps.verifySmtp).toHaveBeenCalledOnce();
    expect(lines.join("\n")).not.toContain("super-secret-app-password");
    expect(lines.join("\n")).not.toContain("secret-user@gmail.com");
    expect(lines).toEqual([
      "SMTP DIAGNOSTIC DNS: OK",
      "SMTP DIAGNOSTIC TCP: OK",
      "SMTP DIAGNOSTIC TLS: OK",
      "SMTP DIAGNOSTIC VERIFY: OK",
    ]);
  });

  it("maps verify failure codes without leaking provider messages", async () => {
    setSmtp();
    const deps = okDeps({
      verifySmtp: vi.fn(async () => ({
        ok: false as const,
        error: "Login failed for secret-user@gmail.com pass=xyz",
      })),
    });
    const result = await runSmtpConnectivityDiagnostic(deps);
    expect(result.verify).toBe("FAIL");
    expect(result.error).toBe("SMTP_CONNECTION_FAILED");
    expect(JSON.stringify(result)).not.toContain("secret-user@gmail.com");
    expect(JSON.stringify(result)).not.toContain("xyz");
  });

  it("stops after TCP failure and uses a safe error type", async () => {
    setSmtp();
    const deps = okDeps({
      tcpConnect: vi.fn(async () => {
        throw Object.assign(new Error("connect timeout"), { code: "ETIMEDOUT" });
      }),
    });
    const result = await runSmtpConnectivityDiagnostic(deps);
    expect(result.dns).toBe("OK");
    expect(result.tcp).toBe("FAIL");
    expect(result.tls).toBe("FAIL");
    expect(result.verify).toBe("FAIL");
    expect(result.error).toBe("Timeout");
    expect(deps.tlsHandshake).not.toHaveBeenCalled();
    expect(deps.verifySmtp).not.toHaveBeenCalled();
  });

  it("maps diagnostic errors without secrets", () => {
    expect(smtpDiagnosticSafeError({ code: "ENOTFOUND" })).toBe("DNS_FAILED");
    expect(smtpDiagnosticSafeError({ code: "ECONNREFUSED" })).toBe("TCP_REFUSED");
    expect(smtpDiagnosticSafeError({ code: "EAUTH" })).toBe("SMTP_AUTH_FAILED");
    const dumped = JSON.stringify({
      error: smtpDiagnosticSafeError(Object.assign(new Error("Login failed for secret-user@gmail.com pass=xyz"), { code: "EAUTH" })),
    });
    expect(dumped).not.toContain("secret-user@gmail.com");
    expect(dumped).not.toContain("xyz");
  });

  it("prints only safe log lines", () => {
    const lines: string[] = [];
    const spy = vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      lines.push(String(chunk).replace(/\n$/, ""));
      return true;
    });
    logSmtpDiagnostic({
      dns: "OK",
      tcp: "FAIL",
      tls: "FAIL",
      verify: "FAIL",
      error: "SMTP_CONNECTION_FAILED",
    });
    spy.mockRestore();
    expect(lines).toEqual([
      "SMTP DIAGNOSTIC DNS: OK",
      "SMTP DIAGNOSTIC TCP: FAIL",
      "SMTP DIAGNOSTIC TLS: FAIL",
      "SMTP DIAGNOSTIC VERIFY: FAIL",
      "SMTP DIAGNOSTIC ERROR: SMTP_CONNECTION_FAILED",
    ]);
  });

  it("does not open TCP/TLS or verify SMTP when Resend is the provider", async () => {
    setSmtp();
    process.env.RESEND_API_KEY = "re_secret_must_not_be_logged";
    const deps = okDeps();
    const lines: string[] = [];
    const spy = vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      lines.push(String(chunk).replace(/\n$/, ""));
      return true;
    });
    const result = await runSmtpConnectivityDiagnostic(deps);
    spy.mockRestore();
    expect(result.error).toBe("SKIPPED_RESEND");
    expect(deps.lookup).not.toHaveBeenCalled();
    expect(deps.tcpConnect).not.toHaveBeenCalled();
    expect(deps.tlsHandshake).not.toHaveBeenCalled();
    expect(deps.verifySmtp).not.toHaveBeenCalled();
    expect(lines).toEqual(["SMTP DIAGNOSTIC SKIPPED: resend"]);
    expect(lines.join("\n")).not.toContain("re_secret_must_not_be_logged");
  });
});
