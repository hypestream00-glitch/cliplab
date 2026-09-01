import { afterEach, describe, expect, it, vi } from "vitest";
import { brand, brandMetadataBase, defaultClipTitle } from "@/lib/config/brand";
import { publicBaseUrl } from "@/lib/env/app-url";
import { appOrigin } from "@/lib/email/app-url";
import { allowedOrigins } from "@/lib/security/cors";
import { renderEmailTemplate } from "@/lib/email/templates";
import { emailProviderName } from "@/lib/email/config";
import { getEmailProvider } from "@/lib/email/send-email";
import { SmtpEmailProvider } from "@/lib/email/smtp-provider";

describe("CortaClip public brand", () => {
  it("exposes CortaClip identity and cortaclip.com without CLIPLAB", () => {
    expect(brand.name).toBe("CortaClip");
    expect(brand.shortName).toBe("CC");
    expect(brand.url).toBe("https://cortaclip.com");
    expect(brand.supportEmail).toBe("suporte@cortaclip.com");
    expect(brand.description).toMatch(/inteligência artificial/i);
    expect(JSON.stringify(brand)).not.toMatch(/CLIPLAB|cliplab\.app/i);
    expect(defaultClipTitle()).toBe("Clipe CortaClip");
  });

  it("renders transactional emails with CortaClip and no CLIPLAB", () => {
    const verify = renderEmailTemplate("verify-email", { name: "Ana", actionUrl: "https://cortaclip.com/verify-email?token=abc" });
    expect(verify.subject).toContain("CortaClip");
    expect(verify.text).toContain("CortaClip");
    expect(verify.html).toContain("CortaClip");
    expect(`${verify.subject}${verify.text}${verify.html}`).not.toContain("CLIPLAB");
    expect(verify.text).toContain("https://cortaclip.com/verify-email?token=abc");
  });
});

describe("public URL configuration", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("uses localhost when APP_URL and AUTH_URL are unset", () => {
    vi.stubEnv("APP_URL", "");
    vi.stubEnv("AUTH_URL", "");
    vi.stubEnv("MEDIA_BASE_URL", "");
    expect(publicBaseUrl()).toBe("http://localhost:3000");
    expect(appOrigin()).toBe("http://localhost:3000");
  });

  it("uses APP_URL for production origin without hardcoding Railway", () => {
    vi.stubEnv("APP_URL", "https://cortaclip.com");
    vi.stubEnv("AUTH_URL", "https://cortaclip.com");
    expect(publicBaseUrl()).toBe("https://cortaclip.com");
    expect(appOrigin()).toBe("https://cortaclip.com");
    expect(brandMetadataBase().origin).toBe("https://cortaclip.com");
  });

  it("allows cortaclip.com and www.cortaclip.com together", () => {
    expect(
      allowedOrigins({ NODE_ENV: "production", APP_URL: "https://cortaclip.com" } as NodeJS.ProcessEnv),
    ).toEqual(["https://cortaclip.com", "https://www.cortaclip.com"]);
    expect(
      allowedOrigins({ NODE_ENV: "development", APP_URL: "https://cortaclip.com" } as NodeJS.ProcessEnv),
    ).toEqual(expect.arrayContaining(["http://localhost:3000", "https://cortaclip.com", "https://www.cortaclip.com"]));
  });
});

describe("rebrand does not change email provider selection", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("still selects Resend when RESEND_API_KEY is present", () => {
    vi.stubEnv("RESEND_API_KEY", "re_test_key_not_for_network");
    vi.stubEnv("EMAIL_FROM", "noreply@cortaclip.com");
    expect(emailProviderName()).toBe("resend");
    expect(getEmailProvider().name).toBe("resend");
  });

  it("still bypasses SMTP send when Resend is active", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test_key_not_for_network");
    vi.stubEnv("SMTP_HOST", "smtp.gmail.com");
    vi.stubEnv("SMTP_USER", "a@b.com");
    vi.stubEnv("SMTP_PASSWORD", "app-password");
    vi.stubEnv("SMTP_FROM", "noreply@cortaclip.com");
    const result = await new SmtpEmailProvider().send({
      to: "user@example.com",
      subject: "x",
      html: "<p>x</p>",
      text: "x",
    });
    expect(result).toEqual({ ok: false, error: "SMTP_SKIPPED_RESEND" });
  });
});
