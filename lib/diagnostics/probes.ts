import { prisma } from "@/lib/db/prisma";
import { getStorage } from "@/lib/storage";
import { pingRedis } from "@/lib/features/system-status";
import { envPresent } from "@/lib/env/status";
import { logger } from "@/lib/logger";

export type ProbeTarget = "database" | "storage" | "redis" | "openai" | "upload-post" | "smtp";

export type ProbeResult = { target: ProbeTarget; ok: boolean; message: string };

export async function runConnectionProbe(target: ProbeTarget): Promise<ProbeResult> {
  if (target === "database") {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return { target, ok: true, message: "Database OK" };
    } catch {
      return { target, ok: false, message: "Database ERROR" };
    }
  }
  if (target === "storage") {
    try {
      const storage = getStorage();
      const key = `health/probe-${Date.now()}.txt`;
      await storage.putObject(key, Buffer.from("ok"), "text/plain");
      await storage.deleteObject(key);
      return { target, ok: true, message: `Storage OK (${storage.name})` };
    } catch {
      return { target, ok: false, message: "Storage ERROR" };
    }
  }
  if (target === "redis") {
    const status = await pingRedis();
    return {
      target,
      ok: status === "READY" || status === "LOCAL FALLBACK",
      message: status,
    };
  }
  if (target === "smtp") {
    const { emailProviderName, isEmailConfigured, emailConfigurationDetail } = await import("@/lib/email/config");
    if (emailProviderName() === "resend") {
      return { target, ok: isEmailConfigured(), message: isEmailConfigured() ? "RESEND CONFIGURED" : emailConfigurationDetail() };
    }
    if (!isEmailConfigured()) {
      return { target, ok: false, message: emailConfigurationDetail() };
    }
    const { SmtpEmailProvider } = await import("@/lib/email/smtp-provider");
    const result = await new SmtpEmailProvider().verifyConnection();
    return { target, ok: result.ok, message: result.ok ? "SMTP OK" : "SMTP ERROR" };
  }
  if (target === "openai") {
    const key = process.env.OPENAI_API_KEY?.trim();
    if (!key) return { target, ok: false, message: "CONFIGURATION REQUIRED — OPENAI_API_KEY ausente" };
    try {
      const response = await fetch("https://api.openai.com/v1/models", {
        headers: { Authorization: `Bearer ${key}` },
      });
      if (!response.ok) {
        logger.warn({ status: response.status }, "openai probe failed");
        return { target, ok: false, message: `OpenAI ERROR (${response.status})` };
      }
      return { target, ok: true, message: "OpenAI OK" };
    } catch {
      return { target, ok: false, message: "OpenAI ERROR" };
    }
  }
  const { testUploadPostConnection } = await import("@/lib/social/upload-post/diagnose");
  const code = await testUploadPostConnection();
  return { target, ok: code === "CONNECTED", message: code };
}

export function probeTargets(): ProbeTarget[] {
  return ["database", "storage", "redis", "openai", "upload-post", "smtp"];
}

export const openaiConfigured = () => envPresent("OPENAI_API_KEY");
