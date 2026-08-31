import { describe, expect, it } from "vitest";
import { signUpSchema, loginSchema } from "@/lib/validations";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { emailProviderStatus } from "@/lib/email/status";
import { billingProviderMode } from "@/lib/billing/provider";

describe("auth schemas", () => {
  it("rejects register without matching passwords or terms", () => {
    const base = {
      name: "Pablo",
      email: "pablo@example.com",
      password: "secret123",
      confirmPassword: "secret123",
      terms: true as const,
    };
    expect(signUpSchema.safeParse(base).success).toBe(true);
    expect(signUpSchema.safeParse({ ...base, confirmPassword: "other123" }).success).toBe(false);
    expect(signUpSchema.safeParse({ ...base, terms: undefined }).success).toBe(false);
    expect(signUpSchema.safeParse({ ...base, email: "nao-e-email" }).success).toBe(false);
  });

  it("rejects empty login password", () => {
    expect(loginSchema.safeParse({ email: "a@b.com", password: "" }).success).toBe(false);
    expect(loginSchema.safeParse({ email: "a@b.com", password: "x" }).success).toBe(true);
  });
});

describe("password hashing", () => {
  it("never stores plaintext", async () => {
    const hash = await hashPassword("demo123456");
    expect(hash).not.toBe("demo123456");
    expect(hash.startsWith("$2")).toBe(true);
    expect(await verifyPassword("demo123456", hash)).toBe(true);
    expect(await verifyPassword("wrong", hash)).toBe(false);
  });
});

describe("email and billing providers", () => {
  it("does not pretend SMTP is configured", () => {
    const prevHost = process.env.SMTP_HOST;
    const prevFrom = process.env.SMTP_FROM;
    delete process.env.SMTP_HOST;
    delete process.env.SMTP_FROM;
    expect(emailProviderStatus()).toBe("EMAIL_PROVIDER_NOT_CONFIGURED");
    if (prevHost) process.env.SMTP_HOST = prevHost;
    if (prevFrom) process.env.SMTP_FROM = prevFrom;
  });

  it("keeps checkout disabled without Stripe test configuration", () => {
    const keys = [
      "STRIPE_SECRET_KEY",
      "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY",
      "STRIPE_PUBLISHABLE_KEY",
      "STRIPE_WEBHOOK_SECRET",
      "STRIPE_PRICE_CREATOR",
      "STRIPE_PRICE_PRO",
    ];
    const prev = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
    for (const key of keys) delete process.env[key];
    expect(billingProviderMode()).toBe("UNCONFIGURED");
    for (const key of keys) {
      if (prev[key]) process.env[key] = prev[key];
    }
  });
});
